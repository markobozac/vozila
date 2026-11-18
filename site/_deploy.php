<?php
/*
 * Pull deploy for markobozac.com/vozila.
 * Called by the GitHub Action after every push to main (no secrets needed):
 * downloads the main branch of the PUBLIC repo markobozac/vozila and copies
 * its site/ folder into this directory. Anyone calling it can only redeploy
 * what is already public on main, so it is rate-limited but not protected.
 */
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-LiteSpeed-Cache-Control: no-cache');
register_shutdown_function(function () { $e = error_get_last(); if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) echo 'php error: ', $e['message'], "\n"; });

const REPO = 'markobozac/vozila';
const BRANCH = 'main';
const SRC = 'site/';
const ALLOWED = '/\.(html|css|js|json|svg|png|jpe?g|webp|ico|txt|xml|webmanifest|mp4)$|^\.htaccess$|^_deploy\.php$/i';
$dir = __DIR__;

function fail(int $code, string $msg): void { http_response_code($code); echo $msg, "\n"; exit; }

function fetch(string $url): string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60,
            CURLOPT_USERAGENT => 'vozila-deploy', CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json']]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body === false || $code >= 400) fail(502, "fetch failed ($code): $url");
        return $body;
    }
    $ctx = stream_context_create(['http' => ['header' => "User-Agent: vozila-deploy\r\nAccept: application/vnd.github+json\r\n", 'timeout' => 60]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) fail(502, "fetch failed: $url");
    return $body;
}

// one deploy at a time, at most one every 15 s
$lock = fopen("$dir/.deploy.lock", 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) fail(429, 'busy');
$stamp = "$dir/.deploy-last";
if (is_file($stamp) && time() - filemtime($stamp) < 15) fail(429, 'too soon, try again in a few seconds');
touch($stamp);

$commit = json_decode(fetch('https://api.github.com/repos/' . REPO . '/commits/' . BRANCH), true);
$sha = $commit['sha'] ?? '';
if (!preg_match('/^[0-9a-f]{40}$/', $sha)) fail(502, 'could not read the latest commit');
$current = is_file("$dir/.deploy-sha") ? trim((string)file_get_contents("$dir/.deploy-sha")) : '';
if ($current === $sha && !isset($_GET['force'])) { echo "up to date $sha\n"; exit; }

$tmpZip = tempnam(sys_get_temp_dir(), 'tz');
file_put_contents($tmpZip, fetch('https://codeload.github.com/' . REPO . '/zip/' . $sha));
$zip = new ZipArchive();
if ($zip->open($tmpZip) !== true) fail(500, 'bad zip');

$root = '';
$written = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if ($root === '') $root = substr($name, 0, strpos($name, '/') + 1);
    if (strpos($name, $root . SRC) !== 0 || substr($name, -1) === '/') continue;
    $rel = substr($name, strlen($root . SRC));
    if ($rel === '' || strpos($rel, '..') !== false || $rel[0] === '/') continue;
    if (!preg_match(ALLOWED, basename($rel))) continue;
    $data = $zip->getFromIndex($i);
    if ($data === false) continue;
    if ($rel === 'index.html') {
        $v = substr($sha, 0, 7);
        $data = preg_replace('#(href|src)="((?:app|data|consent)\.(?:css|js))"#', '$1="$2?v=' . $v . '"', $data);
    }
    $dest = "$dir/$rel";
    if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0755, true);
    $tmp = $dest . '.tmp-' . getmypid();
    if (file_put_contents($tmp, $data) === false || !rename($tmp, $dest)) fail(500, "write failed: $rel");
    $written[] = $rel;
}
$zip->close();
unlink($tmpZip);
if (!in_array('index.html', $written, true)) fail(500, 'site/index.html missing in repo, nothing published');

// remove files this script deployed before that are no longer in the repo
$manifest = "$dir/.deploy-manifest.json";
$old = is_file($manifest) ? (json_decode((string)file_get_contents($manifest), true) ?: []) : [];
foreach (array_diff($old, $written) as $gone) {
    if (strpos($gone, '..') === false && is_file("$dir/$gone")) unlink("$dir/$gone");
}
file_put_contents($manifest, json_encode(array_values($written)));
file_put_contents("$dir/.deploy-sha", $sha);

echo "deployed $sha (" . count($written) . " files)\n";
