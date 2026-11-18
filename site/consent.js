// Google Analytics 4, loaded only after the visitor accepts cookies.
(function () {
  'use strict';
  var GA_ID = 'G-VV278QCV6J';
  var KEY = 'vozila_consent'; // 'yes' | 'no'
  var loaded = false;
  var queue = [];

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } }

  function load() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    queue.forEach(function (a) { window.gtag('event', a[0], a[1]); });
    queue = [];
  }

  function removeCookies() {
    var id = GA_ID.replace(/^G-/, '');
    ['_ga_' + id].forEach(function (n) {
      document.cookie = n + '=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, '');
      document.cookie = n + '=; Max-Age=0; path=/';
    });
  }

  // Public helper used by app.js. Events before consent are dropped, not stored.
  window.track = function (name, params) {
    if (loaded) window.gtag('event', name, params || {});
  };

  function banner() {
    if (document.getElementById('consent')) return;
    var b = document.createElement('div');
    b.id = 'consent';
    b.className = 'consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Kolačići');
    b.innerHTML = '<p>Koristim Google Analytics da vidim koliko ljudi posjećuje stranicu i koje dijelove koriste. Ne prikupljam osobne podatke. Smijem li?</p>' +
      '<div class="cbtn"><button type="button" id="cYes">Prihvaćam</button><button type="button" id="cNo" class="sec">Ne, hvala</button></div>';
    document.body.appendChild(b);
    document.getElementById('cYes').addEventListener('click', function () { set('yes'); b.remove(); load(); });
    document.getElementById('cNo').addEventListener('click', function () { set('no'); b.remove(); removeCookies(); });
  }

  function init() {
    var c = get();
    if (c === 'yes') load();
    else if (c !== 'no') banner();
    var link = document.getElementById('cookieSettings');
    if (link) link.addEventListener('click', function (e) {
      e.preventDefault();
      if (get() === 'yes') { set('no'); removeCookies(); location.reload(); }
      else banner();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
