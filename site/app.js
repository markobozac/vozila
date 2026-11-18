/* markobozac.com/vozila — map, panel, charts and tables built from window.D (scripts/build.py). */
(function () {
  'use strict';
  const D = window.D;
  const A = D.areas;
  const byId = new Map(A.map(a => [a.id, a]));
  const NAT = D.nat.r;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (x, d = 0) => x == null || !isFinite(x) ? '–' : x.toLocaleString('hr-HR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => nf(x, d) + ' %';
  const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d);
  const mil = (x, d = 1) => nf(x / 1e6, d);
  const track = (n, p) => { if (window.track) window.track(n, p); };

  // ---------- metrics
  const METRICS = [
    { k: 'risk', t: 'Indeks rizika', u: '', d: 0, div: true,
      note: 'Prosjek tri omjera prema prosjeku Hrvatske (100): učestalost nesreća, težina posljedica i udio neispravnih vozila. Iznad 100 znači rizik veći od prosjeka.' },
    { k: 'accPer1k', t: 'Nesreće na 1.000 vozila', u: '', d: 1,
      note: 'Sve prometne nesreće u 2024. (i one samo s materijalnom štetom) na 1.000 registriranih vozila. Nesreće se bilježe prema mjestu događaja, vozila prema registraciji.' },
    { k: 'ksiPer10k', t: 'Poginuli i teško ozlijeđeni', u: '', d: 1,
      note: 'Poginuli i teško ozlijeđeni na 10.000 registriranih vozila, godišnji prosjek 2023. i 2024.' },
    { k: 'failPct', t: 'Neispravni na tehničkom', u: '%', d: 1,
      note: 'Udio vozila koja nisu prošla redovni tehnički pregled u 2025., prema postajama za tehnički pregled u županiji.' },
    { k: 'vehPer1k', t: 'Vozila na 1.000 stanovnika', u: '', d: 0,
      note: 'Registrirana motorna vozila 31. 12. 2024. na 1.000 stanovnika. Uključuje i vozila tvrtki (rent-a-car, leasing) registrirana u županiji. Više vozila znači veću izloženost riziku, pa je na karti označeno kao lošije.' },
    { k: 'growth', t: 'Rast voznog parka', u: '%', d: 0,
      note: 'Promjena broja registriranih motornih vozila od 31. 12. 2015. do 31. 12. 2024. Brži rast znači brži rast izloženosti riziku, pa je na karti označen kao lošije.' },
    { k: 'altPct', t: 'Električni i hibridni', u: '%', d: 1, good: 'high',
      note: 'Udio električnih, hibridnih i plug-in hibridnih u osobnim automobilima, stanje 2022. (zadnji objavljeni podaci po županijama).' },
  ];
  let metric = METRICS[0];
  let selected = null;
  const val = (a, k = metric.k) => a.r[k];
  const fmtV = (v, m = metric) => nf(v, m.d) + (m.u ? ' ' + m.u : '');

  // colour scales
  const SEQ = ['--sea-0', '--sea-1', '--sea-2', '--sea-3', '--sea-4', '--sea-5', '--sea-6'];
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // One diverging palette for every metric: indigo = better than the Croatian average, amber/red = worse.
  // Each value is turned into a score where 100 = Croatia and above 100 = worse.
  const DIV = { breaks: [80, 90, 100, 110, 125, 150], colors: ['#3a4592', '#7a86cc', '#d3d8f1', '#fbe6b4', '#f4c04e', '#e08a1e', '#b4471b'] };
  const LEG = ['20 % i više bolje', '10–20 % bolje', '0–10 % bolje', '0–10 % lošije', '10–25 % lošije', '25–50 % lošije', '50 % i više lošije'];
  function score(a, m = metric) {
    if (m.k === 'risk') return a.r.risk;
    const v = val(a, m.k), n = NAT[m.k];
    if (m.k === 'growth') return 100 * (1 + v / 100) / (1 + n / 100);
    return m.good === 'high' ? 100 * n / Math.max(v, 1e-9) : 100 * v / n;
  }
  function classes() { return DIV; }
  function colorOf(v, sc) {
    let i = 0;
    while (i < sc.breaks.length && v >= sc.breaks[i]) i++;
    return sc.colors[i];
  }

  // ---------- hero + KPIs
  const n = D.nat;
  const lastIns = D.ins[D.ins.length - 1];
  const age22 = D.age[D.age.length - 1];
  $('#herofig').innerHTML = [
    [nf(n.veh / 1e6, 2).replace(/0$/, '') + ' mil.', 'registriranih vozila (2024.)'],
    [sgn(NAT.growth, 0) + ' %', 'rast voznog parka od 2015.'],
    [nf(age22.m1, 1) + ' god.', 'prosječna starost osobnog auta'],
    [mil(lastIns.ao.prem * 1e6, 0) + ' mil. €', 'premija autoodgovornosti (2025.)'],
  ].map(([v, l]) => `<span><b>${v}</b>${l}</span>`).join('');

  const kpi = (v, l, d) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
  $('#kpis').innerHTML = [
    kpi(nf(n.acc24), 'prometnih nesreća u 2024.', `<span class="${n.acc24 > n.acc23 ? 'down' : 'up'}">${sgn(NAT.accChg)} % u odnosu na 2023.</span>`),
    kpi(nf(n.killed24), 'poginulih u 2024.', `<span class="${n.killed24 < n.killed23 ? 'up' : 'down'}">${sgn(100 * (n.killed24 / n.killed23 - 1))} % u odnosu na 2023.</span>`),
    kpi(nf(n.serious24), 'teško ozlijeđenih u 2024.', `<span class="${n.serious24 > n.serious23 ? 'down' : 'up'}">${sgn(100 * (n.serious24 / n.serious23 - 1))} % u odnosu na 2023.</span>`),
    kpi(pct(100 * D.tp.fail / D.tp.n), 'vozila palo na tehničkom (2025.)', `${nf(D.tp.n / 1e6, 2)} mil. redovnih pregleda`),
    kpi(nf(lastIns.ao.claims), 'isplaćenih šteta iz autoodgovornosti (2025.)', `${nf(lastIns.ao.paid, 0)} mil. € isplaćeno`),
  ].join('');

  // ---------- map
  const svg = $('#map');
  const G = D.geo;
  svg.setAttribute('viewBox', `0 0 ${G.w} ${G.h}`);
  const NS = 'http://www.w3.org/2000/svg';
  const gShapes = document.createElementNS(NS, 'g');
  const gLabels = document.createElementNS(NS, 'g');
  svg.append(gShapes, gLabels);
  const paths = [];
  for (const s of G.shapes) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', s.d);
    p.setAttribute('class', 'u');
    p.dataset.a = s.a;
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', byId.get(s.a).label);
    gShapes.appendChild(p);
    paths.push(p);
  }
  const labelPts = new Map();
  for (const s of G.shapes) if (!labelPts.has(s.a)) labelPts.set(s.a, [s.lx, s.ly]);
  // small nudges so labels sit on land and do not overlap
  const NUDGE = { du: [-40, -28], st: [-10, -30], zd: [0, -30], si: [5, -10], ri: [15, 0], pu: [10, 0], ck: [0, 8], zg: [8, 2] };

  const tip = $('#tip');
  const fig = $('#mapfig');
  function showTip(e, a) {
    const r = fig.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(a.label)}</b>${metric.t}: ${fmtV(val(a))}`;
    tip.hidden = false;
    let x = e.clientX - r.left + 12, y = e.clientY - r.top + 12;
    if (x > r.width - 200) x -= 220;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  gShapes.addEventListener('pointermove', e => { const a = byId.get(e.target.dataset?.a); if (a) showTip(e, a); });
  gShapes.addEventListener('pointerleave', () => { tip.hidden = true; });
  gShapes.addEventListener('click', e => { const a = byId.get(e.target.dataset?.a); if (a) select(a, false); });
  gShapes.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const a = byId.get(e.target.dataset?.a); if (a) { e.preventDefault(); select(a, false); } } });

  function paint() {
    const sc = classes(metric);
    for (const p of paths) {
      const a = byId.get(p.dataset.a);
      p.setAttribute('fill', colorOf(score(a), sc));
      p.classList.toggle('sel', !!selected && selected.id === a.id);
    }
    // keep selected on top
    if (selected) paths.filter(p => p.dataset.a === selected.id).forEach(p => gShapes.appendChild(p));
    gLabels.innerHTML = '';
    for (const [id, [x, y]] of labelPts) {
      const t = document.createElementNS(NS, 'text');
      const nd = NUDGE[id] || [0, 0];
      t.setAttribute('x', x + nd[0]); t.setAttribute('y', y + nd[1]);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'lbl');
      t.textContent = nf(val(byId.get(id)), metric.d);
      gLabels.appendChild(t);
    }
    // legend
    const rows = sc.colors.map((c, i) => `<div class="row"><span class="sw" style="background:${c}"></span>${LEG[i]}</div>`).slice().reverse().join('');
    $('#legend').innerHTML = `<div class="t">${esc(metric.t)}</div><div class="row" style="color:var(--muted);margin-bottom:2px">u odnosu na prosjek Hrvatske</div>${rows}<div class="row" style="margin-top:4px;color:var(--muted)">Hrvatska: ${fmtV(NAT[metric.k])}</div>`;
    $('#metricNote').textContent = metric.note;
  }

  // tabs
  const tabs = $('#metricTabs');
  tabs.innerHTML = METRICS.map((m, i) => `<button role="tab" type="button" data-i="${i}" aria-selected="${i === 0}">${esc(m.t)}</button>`).join('');
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    metric = METRICS[+b.dataset.i];
    tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b));
    paint(); renderPanel();
    track('select_metric', { metric: metric.k });
  });

  // ---------- panel
  const panel = $('#panel');
  const lvl = (v, nat, higherBad = true) => {
    const r = v / nat;
    if (r > 1.1) return `<span class="lvl ${higherBad ? 'bad' : 'good'}">${sgn(100 * (r - 1), 0)} %</span>`;
    if (r < 0.9) return `<span class="lvl ${higherBad ? 'good' : 'bad'}">${sgn(100 * (r - 1), 0)} %</span>`;
    return `<span class="lvl">≈ prosjek</span>`;
  };
  function ibar(label, v) {
    const max = 250;
    const w = Math.min(100, 100 * v / max);
    return `<div class="ibar"><span>${label}</span><span class="track"><i class="${v > 110 ? 'hi' : ''}" style="width:${w}%"></i><b style="left:${100 * 100 / max}%"></b></span><span class="v">${nf(v)}</span></div>`;
  }
  function spark(series, years) {
    const w = 300, h = 84, pad = 4;
    const lo = Math.min(...series), hi = Math.max(...series);
    const x = i => pad + i * (w - 2 * pad) / (series.length - 1);
    const y = v => h - 16 - (v - lo) / (hi - lo || 1) * (h - 40);
    const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    return `<svg class="mchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Registrirana vozila ${years[0]}.–${years[years.length - 1]}."><path class="ln" d="${d}"/>` +
      `<circle class="dot" cx="${x(series.length - 1)}" cy="${y(series[series.length - 1])}" r="3"/>` +
      `<text x="${pad}" y="${h - 2}">${years[0]}.</text><text x="${w - pad}" y="${h - 2}" text-anchor="end">${years[years.length - 1]}.</text>` +
      `<text x="${pad}" y="${y(series[0]) - 5}">${nf(series[0])}</text><text x="${w - pad}" y="${y(series[series.length - 1]) - 6}" text-anchor="end">${nf(series[series.length - 1])}</text></svg>`;
  }
  const FUELC = [['benz', 'Benzin', 'var(--sea-2)'], ['dies', 'Dizel', 'var(--sea-5)'], ['hyb', 'Hibrid', '#f4c04e'], ['phev', 'Plug-in hibrid', '#e08a1e'], ['ev', 'Električni', '#2f7d5b']];
  function fuelBar(f) {
    const t = f.tot;
    return `<div class="fuelbar">${FUELC.map(([k, , c]) => `<span style="width:${100 * f[k] / t}%;background:${c}" title="${k}"></span>`).join('')}</div>` +
      `<div class="leg2 wrap">${FUELC.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${nf(100 * f[k] / t, f[k] / t < .05 ? 1 : 0)} %</span>`).join('')}</div>`;
  }
  function renderPanel() {
    const a = selected;
    if (!a) {
      panel.innerHTML = `<h3>Hrvatska</h3><div class="cty">Klikni na županiju na karti ili u tablici.</div>
      <div class="stats">
        <div>Indeks rizika<b>100</b></div>
        <div>Registrirana vozila<b>${nf(n.veh)}</b></div>
        <div>Nesreće na 1.000 vozila<b>${nf(NAT.accPer1k, 1)}</b></div>
        <div>Poginuli i teško ozlijeđeni / 10.000 vozila<b>${nf(NAT.ksiPer10k, 1)}</b></div>
        <div>Neispravni na tehničkom<b>${pct(NAT.failPct)}</b></div>
        <div>Vozila na 1.000 stanovnika<b>${nf(NAT.vehPer1k)}</b></div>
      </div>
      <h4>Osobni automobili po gorivu (2022.)</h4>${fuelBar(n.fuel[n.fuel.length - 1])}
      <h4>Registrirana vozila 2015.–2024.</h4>${spark(n.vehSeries, D.meta.vehYears)}`;
      return;
    }
    const r = a.r;
    const st = D.stations.filter(s => s.pu === a.id).map(s => ({ ...s, p: 100 * s.fail / s.n })).sort((x, y) => y.p - x.p);
    const f = a.fuel[a.fuel.length - 1];
    panel.innerHTML = `<h3>${esc(a.label)}</h3>
      <div class="cty">${a.id === 'zg' ? 'Policijska uprava zagrebačka: Grad Zagreb i Zagrebačka županija' : 'Županija'} · ${nf(a.pop)} stanovnika</div>
      <h4>Indeks rizika: ${nf(r.risk)} ${lvl(r.risk, 100)}</h4>
      ${ibar('Učestalost', a.idx.freq)}${ibar('Težina', a.idx.sev)}${ibar('Stanje vozila', a.idx.cond)}
      <div class="stats">
        <div>Nesreće 2024.<b>${nf(a.acc24)} <span class="pc">${sgn(r.accChg)} %</span></b></div>
        <div>Na 1.000 vozila<b>${nf(r.accPer1k, 1)}</b>${lvl(r.accPer1k, NAT.accPer1k)}</div>
        <div>Poginuli 2023. / 2024.<b>${nf(a.killed23)} / ${nf(a.killed24)}</b></div>
        <div>Teško ozlijeđeni 2023. / 2024.<b>${nf(a.serious23)} / ${nf(a.serious24)}</b></div>
        <div>Poginuli i teško ozl. / 10.000 vozila<b>${nf(r.ksiPer10k, 1)}</b>${lvl(r.ksiPer10k, NAT.ksiPer10k)}</div>
        <div>Neispravni na tehničkom (2025.)<b>${pct(r.failPct)}</b>${lvl(r.failPct, NAT.failPct)}</div>
        <div>Registrirana vozila<b>${nf(a.veh)}</b></div>
        <div>Na 1.000 stanovnika<b>${nf(r.vehPer1k)}</b></div>
        <div>Prve registracije 2025.<b>${nf(a.firstReg25)} <span class="pc">${sgn(r.regChg)} %</span></b></div>
        <div>Prekršaji na 1.000 vozača<b>${nf(r.offPer1k)}</b></div>
      </div>
      <h4>Registrirana vozila 2015.–2024. (${sgn(r.growth, 0)} %)</h4>${spark(a.vehSeries, D.meta.vehYears)}
      <h4>Osobni automobili po gorivu (2022.)</h4>${fuelBar(f)}
      <h4>Postaje za tehnički pregled, 2025.</h4>
      <ul class="stlist">${st.map(s => `<li><span>${esc(s.town)}</span><span>${nf(s.n)}</span><span>${pct(s.p)}</span></li>`).join('')}</ul>`;
  }
  function select(a, scroll) {
    selected = selected && a && selected.id === a.id ? null : a;
    paint(); renderPanel();
    if (selected) track('select_area', { area: selected.id });
    if (scroll) $('#map-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- generic charts
  function lineChart(el, opts) {
    const w = 440, h = 230, L = 50, R = 10, T = 16, B = 24;
    const xs = opts.x;
    const all = opts.series.flatMap(s => s.v.filter(v => v != null));
    const lo = opts.min != null ? opts.min : Math.min(0, ...all), hi = Math.max(...all) * 1.08;
    const x = i => L + i * (w - L - R) / (xs.length - 1);
    const y = v => T + (h - T - B) * (1 - (v - lo) / (hi - lo));
    const ticks = niceTicks(lo, hi, 4);
    let s = `<svg class="mchart lc" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.label)}">`;
    for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${opts.yf ? opts.yf(t) : nf(t)}</text>`;
    const step = Math.ceil(xs.length / 9);
    xs.forEach((xv, i) => { if (i % step === 0 || i === xs.length - 1) s += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${xv}</text>`; });
    if (opts.brk != null) { const i = xs.indexOf(opts.brk); if (i > 0) { const bx = (x(i) + x(i - 1)) / 2; s += `<line class="brk" x1="${bx}" x2="${bx}" y1="${T}" y2="${h - B}"/><text x="${bx - 4}" y="${h - B - 6}" text-anchor="end">nova metodologija →</text>`; } }
    for (const se of opts.series) {
      let d = '', pen = false;
      se.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      s += `<path class="${se.cls}" d="${d}"/>`;
      const li = se.v.length - 1;
      if (se.v[li] != null) s += `<circle cx="${x(li)}" cy="${y(se.v[li])}" r="3" class="dot" style="fill:currentColor"/><text class="vl" x="${x(li) - 4}" y="${y(se.v[li]) - 8}" text-anchor="end">${opts.lf ? opts.lf(se.v[li]) : nf(se.v[li])}</text>`;
    }
    el.innerHTML = s + '</svg>';
  }
  function barChart(el, opts) {
    const w = 440, h = 230, L = 50, R = 10, T = 18, B = 24;
    const xs = opts.x;
    const tot = xs.map((_, i) => opts.series.reduce((s, se) => s + (se.v[i] || 0), 0));
    const hi = Math.max(...tot) * 1.1;
    const bw = (w - L - R) / xs.length;
    const y = v => T + (h - T - B) * (1 - v / hi);
    const ticks = niceTicks(0, hi, 4);
    let s = `<svg class="mchart lc" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.label)}">`;
    for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${opts.yf ? opts.yf(t) : nf(t)}</text>`;
    const step = Math.ceil(xs.length / 9);
    xs.forEach((xv, i) => {
      let acc = 0;
      for (const se of opts.series) {
        const v = se.v[i] || 0;
        s += `<rect class="${se.cls}" x="${L + i * bw + bw * .15}" width="${bw * .7}" y="${y(acc + v)}" height="${Math.max(0, y(acc) - y(acc + v))}"><title>${xv}: ${se.name} ${nf(v)}</title></rect>`;
        acc += v;
      }
      if (opts.labels) s += `<text class="vl" x="${L + i * bw + bw / 2}" y="${y(tot[i]) - 4}" text-anchor="middle">${opts.lf ? opts.lf(tot[i]) : nf(tot[i])}</text>`;
      if (i % step === 0 || i === xs.length - 1 || opts.allX) s += `<text x="${L + i * bw + bw / 2}" y="${h - 6}" text-anchor="middle">${xv}</text>`;
    });
    el.innerHTML = s + '</svg>';
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const st = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => span / m <= n + .5);
    const out = []; for (let t = Math.ceil(lo / st) * st; t <= hi + 1e-9; t += st) out.push(+t.toFixed(10));
    return out;
  }
  const legend = (el, items) => { $(el).innerHTML = items.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join(''); };

  // ---------- fleet section
  const vy = D.meta.vehYears;
  lineChart($('#chFleet'), { label: 'Registrirana motorna vozila', x: vy.map(y => y + '.'), series: [{ cls: 'ln2', v: n.vehSeries.map(v => v / 1e6) }], min: 1.5, yf: t => nf(t, 1), lf: v => nf(v, 2) });
  const ageY = D.age.filter(r => r.y >= 2010);
  lineChart($('#chAge'), { label: 'Prosječna starost osobnih automobila', x: ageY.map(r => r.y + '.'), series: [{ cls: 'ln3', v: ageY.map(r => r.m1) }], min: 8, yf: t => nf(t, 0), lf: v => nf(v, 1) });
  const nu = D.newused.filter(r => r.y >= 2010);
  barChart($('#chNewUsed'), { label: 'Prve registracije osobnih automobila', x: nu.map(r => "'" + String(r.y).slice(2)), series: [{ name: 'nova', cls: 'bar', v: nu.map(r => r.new / 1000) }, { name: 'rabljena', cls: 'bar2', v: nu.map(r => r.used / 1000) }], yf: t => nf(t), allX: true });
  legend('#lgNewUsed', [['Nova', 'var(--sea-4)'], ['Rabljena (uvoz)', 'var(--amber)']]);
  const ev = D.evNat.filter(r => r.y >= 2014);
  barChart($('#chEv'), { label: 'Električni i hibridni osobni automobili', x: ev.map(r => "'" + String(r.y).slice(2)), series: [{ name: 'hibridni', cls: 'bar3', v: ev.map(r => r.hyb / 1000) }, { name: 'plug-in hibridni', cls: 'bar2', v: ev.map(r => r.phev / 1000) }, { name: 'električni', cls: 'bar', v: ev.map(r => r.ev / 1000) }], yf: t => nf(t), labels: true, lf: v => nf(v, v < 10 ? 1 : 0), allX: true });
  legend('#lgEv', [['Hibridni', 'var(--sea-2)'], ['Plug-in hibridni', 'var(--amber)'], ['Električni', 'var(--sea-4)']]);
  const va = D.vkm.byAge;
  barChart($('#chVkmAge'), { label: 'Vozilo-kilometri po starosti', x: ['< 2 g.', '2–4 g.', '5–9 g.', '10–19 g.', '20+ g.'], series: [{ name: 'mil. vkm', cls: 'bar', v: Object.values(va) }], labels: true, allX: true, lf: v => nf(v) });
  const vf = D.vkm.byFuel;
  const fuelLbl = { 'Benzinska': 'Benzin', 'Dizelska': 'Dizel', 'Električna': 'Struja', 'Hibridna benzinska': 'Hib. benzin', 'Hibridna dizelska': 'Hib. dizel', 'Na ostala goriva': 'Ostalo' };
  barChart($('#chVkmFuel'), { label: 'Vozilo-kilometri po gorivu', x: Object.keys(vf).map(k => fuelLbl[k] || k), series: [{ name: 'mil. vkm', cls: 'bar2', v: Object.values(vf) }], labels: true, allX: true, lf: v => nf(v) });

  const old10 = (va['10-19'] + va['20+']) / D.vkm.total;
  const nuLast = D.newused[D.newused.length - 1];
  const evL = D.evNat[D.evNat.length - 1], ev20 = D.evNat.find(r => r.y === 2020);
  const fuelLast = n.fuel[n.fuel.length - 1];
  $('#fleetNotes').innerHTML = [
    `Od 2015. do 2024. broj registriranih motornih vozila porastao je s <b>${nf(n.vehSeries[0])}</b> na <b>${nf(n.vehSeries[9])}</b> (${sgn(NAT.growth, 0)} %). U 2025. prvi put je registrirano ${nf(D.reg.firstReg25)} vozila svih vrsta (${sgn(100 * (D.reg.firstReg25 / D.reg.firstReg24 - 1))} %), a odjavljeno ${nf(D.reg.dereg25)}.`,
    `Prosječan osobni automobil na tehničkom pregledu star je <b>${nf(age22.m1, 1)} godina</b> (2022.), a ${pct(D.ages22.p10, 0)} ih je starije od 10 godina. Godine 2010. prosjek je bio ${nf(D.age.find(r => r.y === 2010).m1, 1)}.`,
    `Rabljeni automobili iz uvoza čine <b>${pct(100 * nuLast.used / (nuLast.new + nuLast.used), 0)}</b> prvih registracija osobnih automobila (2022.). Zato vozni park brzo raste, ali se ne pomlađuje.`,
    `Automobili stariji od 10 godina prijeđu <b>${pct(100 * old10, 0)}</b> svih kilometara osobnih automobila. Električni prijeđu ${pct(100 * vf['Električna'] / D.vkm.total)}, a hibridi ${pct(100 * (vf['Hibridna benzinska'] + vf['Hibridna dizelska']) / D.vkm.total)}.`,
    `Električnih osobnih automobila bilo je ${nf(evL.ev)} krajem 2022., ${nf(evL.ev / ev20.ev, 1)} puta više nego 2020. Svi električni, hibridni i plug-in hibridni zajedno čine ${pct(100 * (fuelLast.ev + fuelLast.hyb + fuelLast.phev) / fuelLast.tot)} osobnih automobila.`,
  ].map(s => `<li>${s}</li>`).join('');

  // ---------- insurance section
  const ins = D.ins;
  const iy = ins.map(r => "'" + String(r.y).slice(2));
  lineChart($('#chAo'), { label: 'Autoodgovornost premija i štete', x: iy, series: [{ cls: 'ln2', v: ins.map(r => r.ao.prem) }, { cls: 'ln3', v: ins.map(r => r.ao.paid) }], brk: "'23", yf: t => nf(t), lf: v => nf(v) });
  legend('#lgAo', [['Premija', 'var(--sea-4)'], ['Isplaćene štete', 'var(--amber)']]);
  lineChart($('#chKasko'), { label: 'Kasko premija i štete', x: iy, series: [{ cls: 'ln2', v: ins.map(r => r.kasko.prem) }, { cls: 'ln3', v: ins.map(r => r.kasko.paid) }], brk: "'23", yf: t => nf(t), lf: v => nf(v) });
  legend('#lgKasko', [['Premija', 'var(--sea-4)'], ['Isplaćene štete', 'var(--amber)']]);

  const i22 = ins.find(r => r.y === 2022), i25 = lastIns, i13 = ins.find(r => r.y === 2013), i16 = ins.find(r => r.y === 2016);
  const avgClaim = r => 1e6 * r.ao.paid / r.ao.claims, avgPrem = r => 1e6 * r.ao.prem / r.ao.pol;
  $('#insKpis').innerHTML = [
    kpi(nf(i25.ao.prem, 0) + ' mil. €', 'premija autoodgovornosti 2025.', `${sgn(100 * (i25.ao.prem / i22.ao.prem - 1), 0)} % u odnosu na 2022.`),
    kpi(nf(avgPrem(i25)) + ' €', 'prosječna premija po polici AO', `2022.: ${nf(avgPrem(i22))} €`),
    kpi(nf(avgClaim(i25)) + ' €', 'prosječna isplaćena šteta AO', `2022.: ${nf(avgClaim(i22))} € (${sgn(100 * (avgClaim(i25) / avgClaim(i22) - 1), 0)} %)`),
    kpi(pct(100 * i25.ao.paid / i25.ao.prem, 0), 'isplaćene štete / premija AO', `kasko: ${pct(100 * i25.kasko.paid / i25.kasko.prem, 0)}`),
  ].join('');

  const cars = D.aoCars;
  $('#aoCarsTable').innerHTML = `<thead><tr class="nohover"><th>Godina</th><th>Police</th><th>Premija (mil. €)</th><th>Prosječna premija</th><th>Štete</th><th>Štete na 100 polica</th><th>Prosječna šteta</th></tr></thead><tbody>` +
    cars.map(r => `<tr class="nohover"><td>${r.y}.</td><td>${nf(r.pol)}</td><td>${nf(r.prem / 1e6, 1)}</td><td>${nf(r.prem / r.pol)} €</td><td>${nf(r.claims)}</td><td>${nf(100 * r.claims / r.pol, 1)}</td><td>${nf(r.paid / r.claims)} €</td></tr>`).join('') + '</tbody>';
  const grp = D.aoGroups25.filter(g => ['Osobni automobili', 'Teretna vozila', 'Motocikli', 'Traktori', 'Autobusi'].includes(g.g));
  $('#aoGroupsTable').innerHTML = `<thead><tr class="nohover"><th>Skupina vozila</th><th>Police</th><th>Prosječna premija</th><th>Štete na 100 polica</th><th>Prosječna šteta</th><th>Štete / premija</th></tr></thead><tbody>` +
    grp.map(g => `<tr class="nohover"><td>${esc(g.g)}</td><td>${nf(g.pol)}</td><td>${nf(g.prem / g.pol)} €</td><td>${nf(100 * g.claims / g.pol, 1)}</td><td>${nf(g.paid / g.claims)} €</td><td>${pct(100 * g.paid / g.prem, 0)}</td></tr>`).join('') + '</tbody>';

  // ---------- insurers + Croatia osiguranje
  const SHORT = { croa: 'Croatia osiguranje', euro: 'Euroherc', adri: 'Adriatic', alli: 'Allianz', gene: 'Generali', wien: 'Wiener', uniq: 'UNIQA', trig: 'Triglav', hoko: 'HOK', graw: 'GRAWE', agra: 'Agram Life', merk: 'Merkur', hrva: 'Hrvatsko kreditno' };
  const shortName = nm => { const k = nm.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4); return SHORT[k] || nm; };
  const insTot = D.insurers.reduce((s, i) => s + i.prem2025, 0), insTot24 = D.insurers.reduce((s, i) => s + i.prem2024, 0);
  const maxP = Math.max(...D.insurers.map(i => i.prem2025));
  $('#insurersChart').innerHTML = `<div class="ophead"><span>Društvo</span><span>Naplaćena premija neživota 2025.</span><span class="val">Udio</span></div>` +
    D.insurers.filter(i => i.prem2025 > 5e6).map(i => {
      const nm = shortName(i.name), hl = nm === 'Croatia osiguranje';
      return `<div class="oprow${hl ? ' hl' : ''}"><span class="nm">${esc(nm)}<span class="where">${nf(i.prem2025 / 1e6, 1)} mil. € · ${sgn(100 * (i.prem2025 / i.prem2024 - 1))} %</span></span><span class="barw"><span class="bar" style="width:${100 * i.prem2025 / maxP}%"></span></span><span class="val">${pct(100 * i.prem2025 / insTot)}</span></div>`;
    }).join('');
  const coI = D.insurers.find(i => shortName(i.name) === 'Croatia osiguranje');
  const cm = D.coMotor, mm = D.mktMotor;
  const coShare = (y, k) => 100 * cm[y][k].written * 1000 / mm[y][k].prem;
  $('#coKpis').innerHTML = [
    kpi(pct(100 * coI.prem2025 / insTot), 'Croatia osiguranje: udio u neživotnoj premiji', `1. mjesto · 2024.: ${pct(100 * coI.prem2024 / insTot24)}`),
    kpi('≈ ' + pct(coShare(2025, 'ao'), 0), 'udio u autoodgovornosti (2025.)', `${nf(cm[2025].ao.written / 1000, 1)} mil. € premije, ${sgn(100 * (cm[2025].ao.written / cm[2024].ao.written - 1))} %`),
    kpi('≈ ' + pct(coShare(2025, 'kasko'), 0), 'udio u kasku (2025.)', `${nf(cm[2025].kasko.written / 1000, 1)} mil. € premije, ${sgn(100 * (cm[2025].kasko.written / cm[2024].kasko.written - 1))} %`),
    kpi(pct(100 * cm[2025].ao.incurred / cm[2025].ao.earned, 0), 'AO: nastale štete / zarađena premija', `2024.: ${pct(100 * cm[2024].ao.incurred / cm[2024].ao.earned, 0)} · kasko 2025.: ${pct(100 * cm[2025].kasko.incurred / cm[2025].kasko.earned, 0)}`),
  ].join('');
  const agram = D.insurers.filter(i => ['Euroherc', 'Adriatic', 'Agram Life'].includes(shortName(i.name))).reduce((s, i) => s + i.prem2025, 0);

  const c0 = cars[0], cL = cars[cars.length - 1];
  const ch = D.aoChannels25;
  const i24 = ins.find(r => r.y === 2024);
  $('#insNotes').innerHTML = [
    `Nakon liberalizacije tržišta autoodgovornosti, koja je počela ulaskom u EU, premija je pala s ${nf(i13.ao.prem, 0)} mil. € (2013.) na ${nf(i16.ao.prem, 0)} mil. € (2016.). Od 2020. ponovno brzo raste i 2025. iznosi <b>${nf(i25.ao.prem, 0)} mil. €</b>.`,
    `Za osobne automobile prosječna premija AO porasla je s ${nf(c0.prem / c0.pol)} € (${c0.y}.) na <b>${nf(cL.prem / cL.pol)} €</b> (${cL.y}.), a prosječna isplaćena šteta s ${nf(c0.paid / c0.claims)} € na <b>${nf(cL.paid / cL.claims)} €</b>. Broj isplaćenih šteta porastao je s ${nf(100 * c0.claims / c0.pol, 1)} na ${nf(100 * cL.claims / cL.pol, 1)} na 100 polica.`,
    `U 2024. osiguratelji su isplatili ${nf(i24.ao.claims)} šteta iz autoodgovornosti, a policija je evidentirala ${nf(n.acc24)} prometnih nesreća. Većina manjih sudara nikad ne uđe u policijsku statistiku, pa su podaci osiguratelja o štetama precizniji izvor za procjenu rizika po području od javnih podataka.`,
    `Croatia osiguranje drži ${pct(100 * coI.prem2025 / insTot)} neživotne premije i oko ${pct(coShare(2025, 'kasko'), 0)} kaska, ali tek oko ${pct(coShare(2025, 'ao'), 0)} autoodgovornosti. Društva Grupe Agram (Euroherc, Adriatic, Agram Life) zajedno imaju ${pct(100 * agram / insTot)} neživotne premije. Udjeli Croatia osiguranja u AO i kasku su procjena: zaračunata premija iz SFCR-a stavljena je u odnos s naplaćenom premijom tržišta iz statistike HANFA-e.`,
    `Autoodgovornost se i dalje prodaje uglavnom uživo: ${pct(100 * ch.internal / ch.total, 0)} premije ide kroz vlastitu prodaju osiguratelja, ${pct(100 * ch.agencies / ch.total, 0)} kroz agencije (uključujući one na stanicama za tehnički pregled), a digitalnim kanalima tek ${pct(100 * ch.digital / ch.total, 1)} (2025.).`,
  ].map(s => `<li>${s}</li>`).join('');

  // ---------- insights
  const sortBy = k => A.slice().sort((x, y) => y.r[k] - x.r[k]);
  const gs = byId.get('gs'), zg = byId.get('zg');
  const failS = sortBy('failPct'), growS = sortBy('growth'), altS = sortBy('altPct'), riskS = sortBy('risk');
  const stAll = D.stations.filter(s => s.n > 5000).map(s => ({ ...s, p: 100 * s.fail / s.n })).sort((x, y) => y.p - x.p);
  const btn = a => `<button type="button" class="lnk" data-a="${a.id}">${esc(a.label)}</button>`;
  const cards = [
    { n: 'Rizik', h: `Najrizičnije: ${riskS[0].label}, ${riskS[1].label} i ${riskS[2].label}`,
      p: `Indeks ${nf(riskS[0].r.risk)}, ${nf(riskS[1].r.risk)} i ${nf(riskS[2].r.risk)} (prosjek 100). Sve tri imaju autocestu A1 i jak ljetni tranzit, pa dio nesreća vjerojatno rade vozila registrirana drugdje. Najniži indeks imaju ${riskS[19].label} (${nf(riskS[19].r.risk)}) i ${riskS[18].label} (${nf(riskS[18].r.risk)}).`,
      list: riskS.slice(0, 5) },
    { n: 'Težina', h: 'Zagreb: puno sudara, malo teških posljedica',
      p: `Na području PU zagrebačke dogodi se ${nf(zg.r.accPer1k, 1)} nesreća na 1.000 vozila, blizu prosjeka, ali poginulih i teško ozlijeđenih ima ${nf(zg.r.ksiPer10k, 1)} na 10.000 vozila, ${nf(100 * (1 - zg.r.ksiPer10k / NAT.ksiPer10k), 0)} % manje od prosjeka. MUP u biltenu opisuje istu pravilnost: gdje je promet gušći, nesreća je više, ali su posljedice blaže. U Lici je ta stopa ${nf(gs.r.ksiPer10k, 1)}.` },
    { n: 'Tehnički', h: `Svako šesto vozilo padne na tehničkom`,
      p: `U 2025. neispravno je bilo ${pct(100 * D.tp.fail / D.tp.n)} vozila na redovnom pregledu. Najlošije stoji ${failS[0].label} (${pct(failS[0].r.failPct)}), najbolje ${failS[19].label} (${pct(failS[19].r.failPct)}). Među većim postajama najviše padova ima ${stAll[0].town} (${pct(stAll[0].p, 0)}), a najmanje postaje u Zagrebu (oko ${pct(stAll[stAll.length - 1].p, 0)}).`,
      list: failS.slice(0, 5), k: 'failPct' },
    { n: 'Rast', h: `Vozni park raste najbrže u ${growS[0].label.replace('ska', 'skoj').replace('ačka', 'ačkoj')} županiji`,
      p: `Od 2015. broj vozila u Zadarskoj porastao je ${sgn(growS[0].r.growth, 0)} %, u Krapinsko-zagorskoj ${sgn(byId.get('kr').r.growth, 0)} %, a u Hrvatskoj ${sgn(NAT.growth, 0)} %. Najsporije raste Požeško-slavonska (${sgn(byId.get('pz').r.growth, 0)} %).` },
    { n: 'Tranzicija', h: 'Električni i hibridni: Zagreb vodi, ostatak tek kreće',
      p: `Krajem 2022. električni i hibridni činili su ${pct(zg.r.altPct)} osobnih automobila u Zagrebu i okolici, a ${pct(NAT.altPct)} u Hrvatskoj. Najniži udio imaju ${altS[19].label} i ${altS[18].label} (ispod ${pct(Math.ceil(altS[18].r.altPct * 10) / 10)}).`,
      list: altS.slice(0, 5), k: 'altPct' },
    { n: 'Osiguranje', h: `Šteta iz autoodgovornosti skuplja je ${nf(100 * (avgClaim(i25) / avgClaim(i22) - 1), 0)} % nego 2022.`,
      p: `Prosječna isplaćena šteta porasla je s ${nf(avgClaim(i22))} € na ${nf(avgClaim(i25))} €, a premija po polici s ${nf(avgPrem(i22))} € na ${nf(avgPrem(i25))} €. Na svaki euro premije AO u 2025. isplaćeno je ${nf(i25.ao.paid / i25.ao.prem, 2)} € šteta, uz troškove prodaje i pričuve.` },
    { n: 'Croatia osiguranje', h: 'Lider u neživotu i kasku, slabiji u autoodgovornosti',
      p: `Croatia osiguranje ima ${pct(100 * coI.prem2025 / insTot)} neživotne premije i oko ${pct(coShare(2025, 'kasko'), 0)} tržišta kaska, ali oko ${pct(coShare(2025, 'ao'), 0)} autoodgovornosti, najveće vrste neživotnog osiguranja (${pct(100 * mm[2025].ao.prem / insTot, 0)} premije). Cijena AO ovisi o riziku vozača, vozila i područja, pa je bolja procjena rizika po području, poput one na karti, izravno povezana s rastom udjela.` },
  ];
  $('#insights').innerHTML = cards.map(c => `<article class="card"><span class="n">${c.n}</span><h3>${esc(c.h)}</h3><p>${c.p}</p>` +
    (c.list ? `<ol>${c.list.map(a => `<li>${btn(a)} · ${c.k ? fmtV(a.r[c.k], METRICS.find(m => m.k === c.k)) : nf(a.r.risk)}</li>`).join('')}</ol>` : '') + `</article>`).join('');
  $('#insights').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const card = b.closest('.card');
    const lst = card.querySelector('ol');
    const k = [...$('#insights').children].indexOf(card);
    const mk = cards[k].k || 'risk';
    metric = METRICS.find(m => m.k === mk);
    tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', METRICS[+x.dataset.i] === metric));
    selected = null; select(byId.get(b.dataset.a), true);
  });

  // ---------- ranking table
  const cols = [
    { k: 'label', t: 'Županija', f: a => esc(a.label), s: a => a.label },
    { k: 'risk', t: 'Indeks rizika', f: a => nf(a.r.risk) },
    { k: 'accPer1k', t: 'Nesreće / 1.000 vozila', f: a => nf(a.r.accPer1k, 1) },
    { k: 'ksiPer10k', t: 'Teško stradali / 10.000 vozila', f: a => nf(a.r.ksiPer10k, 1) },
    { k: 'failPct', t: 'Neispravni na TP', f: a => pct(a.r.failPct) },
    { k: 'vehPer1k', t: 'Vozila / 1.000 st.', f: a => nf(a.r.vehPer1k) },
    { k: 'growth', t: 'Rast 2015.–2024.', f: a => sgn(a.r.growth, 0) + ' %' },
    { k: 'altPct', t: 'EV i hibridi (2022.)', f: a => pct(a.r.altPct) },
    { k: 'veh', t: 'Vozila', f: a => nf(a.veh), s: a => a.veh },
  ];
  let sk = 'risk', dir = -1;
  const table = $('#rankTable');
  function drawTable() {
    const col = cols.find(c => c.k === sk);
    const v = col.s || (a => a.r[sk]);
    const rows = A.slice().sort((x, y) => { const p = v(x), q = v(y); return (typeof p === 'string' ? p.localeCompare(q, 'hr') : p - q) * dir; });
    table.innerHTML = `<thead><tr>${cols.map(c => `<th scope="col" data-k="${c.k}" tabindex="0" ${c.k === sk ? `aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.t}${c.k === sk ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows.map(a => `<tr data-a="${a.id}">${cols.map(c => `<td${c.k === 'risk' && a.r.risk > 110 ? ' class="num-bad"' : ''}>${c.f(a)}</td>`).join('')}</tr>`).join('')}` +
      `<tr class="tot nohover"><td>Hrvatska</td><td>100</td><td>${nf(NAT.accPer1k, 1)}</td><td>${nf(NAT.ksiPer10k, 1)}</td><td>${pct(NAT.failPct)}</td><td>${nf(NAT.vehPer1k)}</td><td>${sgn(NAT.growth, 0)} %</td><td>${pct(NAT.altPct)}</td><td>${nf(n.veh)}</td></tr></tbody>`;
  }
  const sortCol = k => { if (sk === k) dir = -dir; else { sk = k; dir = k === 'label' ? 1 : -1; } drawTable(); };
  table.addEventListener('click', e => {
    const th = e.target.closest('th'); if (th) return sortCol(th.dataset.k);
    const tr = e.target.closest('tr[data-a]'); if (tr) { selected = null; select(byId.get(tr.dataset.a), true); }
  });
  table.addEventListener('keydown', e => { const th = e.target.closest('th'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortCol(th.dataset.k); } });
  drawTable();

  // ---------- sources
  const SRC = [
    'MUP, Bilten o sigurnosti cestovnog prometa 2024.: nesreće, stradali, prekršaji, stanovništvo, vozači i registrirana vozila po policijskim upravama (2015.–2024.)',
    'Centar za vozila Hrvatske: redovni tehnički pregledi po postajama i vrstama vozila 2025.; registracijski postupci 2024./2025. (cvh.hr)',
    'Centar za vozila Hrvatske (data.gov.hr): vozila po županijama i vrstama goriva 2015.–2022., prosječna starost vozila, nova i rabljena vozila, električna i hibridna vozila, neispravnosti po sklopovima',
    'Državni zavod za statistiku: Registrirana cestovna vozila i cestovne prometne nesreće u 2025. (TRAN-2026-1-2); Obujam cestovnog prometa domaćih vozila u 2024. (TRAN-2026-1-3)',
    'HANFA: Statistika osiguranja 2018.–2025. i vremenske serije broja osiguranja, premija, broja šteta i likvidiranih šteta (2008.–2025.)',
    'HANFA: revidirani pojedinačni podaci društava za osiguranje na dan 31. 12. 2024. i 2025. (naplaćena premija neživotnih osiguranja po društvu)',
    'CROATIA osiguranje d.d.: Izvješće o solventnosti i financijskom stanju za 2024. i 2025., obrazac S.05.01.02 (premije i štete autoodgovornosti i kaska)',
    'Granice županija: Eurostat GISCO, NUTS 2024 (razina 3)',
  ];
  $('#sources').innerHTML = SRC.map(s => `<li>${esc(s)}</li>`).join('');

  // ---------- hero background: faint map
  const hb = $('#herobg');
  hb.setAttribute('viewBox', `0 0 ${G.w} ${G.h}`);
  const sc0 = classes(METRICS[0]);
  hb.innerHTML = G.shapes.map(s => `<path d="${s.d}" fill="${colorOf(score(byId.get(s.a), METRICS[0]), sc0)}" fill-opacity=".5" stroke="#0e0f13" stroke-width="1.2"/>`).join('');

  paint();
  renderPanel();
})();
