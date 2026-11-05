/* Error statistics and plots for the functional results of a subset.
   Plain SVG, no libraries. Colours come from CSS variables (see style.css, "statistics"):
   one hue (--c-series) for single-series charts, blue/red (--c-neg / --c-pos) for the sign of an error. */
const StatsUI = (() => {
  let ctx, base = [], rows = [], sortKey = 'mue', sortDir = 1, scope = 'all', axisIdx = -1;   // axisIdx -1: automatic axis range
  const AXIS_OPTS = { kcal: [1, 2, 5, 10, 20], kj: [5, 10, 20, 50, 100], eh: [0.001, 0.002, 0.005, 0.01, 0.03], native: [0.1, 0.2, 0.5, 1, 2] };   // +- values offered per unit
  let modal, tip, current = null, order = [];
  const NS = 'http://www.w3.org/2000/svg';
  const noun = () => (ctx && ctx.noun) || 'functional';   // what the rows are called (MB08-165 has coupled-cluster 'methods')
  const AXIS_CAP_KCAL = 10;   // the violin axis never extends beyond +-10 kcal/mol (converted to the chosen unit)
  const $$ = (s, el = document) => el.querySelector(s);

  /* ------------------------------------------------------------ statistics (kcal/mol) */
  function compute() {
    base = Object.entries(ctx.FD).map(([name, arr]) => {
      let n = 0, s = 0, a = 0, q = 0, max = -1, maxI = -1;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]; if (v == null) continue;
        n++; s += v; a += Math.abs(v); q += v * v;
        if (Math.abs(v) > max) { max = Math.abs(v); maxI = i; }
      }
      const mse = s / n, ss = q - n * mse * mse;
      return { name, n, mse, mue: a / n, rmse: Math.sqrt(q / n), sd: n > 1 ? Math.sqrt(Math.max(0, ss) / (n - 1)) : 0, max, maxI };
    });
  }
  const f = () => ctx.factor();
  const d = () => ctx.decs();
  const num = (v, signed) => (signed && v > 0 ? '+' : '') + (v * f()).toFixed(d());

  function shown() {
    let list = base;
    const sel = base.filter(r => ctx.isSel(r.name));
    if (scope === 'sel' && sel.length) list = sel;
    const k = sortKey;
    return [...list].sort((a, b) => (k === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a[k] - b[k]) * sortDir || a.name.localeCompare(b.name));
  }

  /* ------------------------------------------------------------ section */
  function mount(context) {
    ctx = context;
    compute();
    const sec = document.getElementById('statsec');
    sec.hidden = false;
    sec.innerHTML = `
      <h2>${ctx.heading || 'Statistics'}</h2>
      <p class="statnote">Error statistics of every ${noun()} ${ctx.where || 'on this subset'}, computed over the reactions that have a result (<i>n</i>).
        Click a row for plots of its errors. ${ctx.tickHint || `Tick the box to show that ${noun()} as a column in the table above.`}</p>
      <div class="statctl"><span class="seg" id="st-scope"></span></div>
      <div class="chartcard">
        <div class="charthead"><div class="charttitle" id="st-bartitle"></div>
          <div class="axisctl"><span>Axis ±</span><span class="seg" id="st-axis" title="Range of the horizontal axis"></span></div></div>
        <div id="st-bars"></div></div>
      <div class="tablewrap stattable"><table>
        <thead><tr id="st-head"></tr></thead><tbody id="st-body"></tbody></table></div>`;
    sec.addEventListener('click', e => {
      const ax = e.target.closest('[data-axis]');
      if (ax) { axisIdx = +ax.dataset.axis; drawBars(); return; }
      const sc = e.target.closest('[data-scope]');
      if (sc) { scope = sc.dataset.scope; refresh(); return; }
      const th = e.target.closest('th[data-k]');
      if (th) { const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; refresh(); return; }
      const cb = e.target.closest('input[data-sel]');
      if (cb) { ctx.toggle(cb.dataset.sel, cb.checked); return; }
      const tr = e.target.closest('tr[data-name]');
      if (tr && !e.target.closest('label')) open(tr.dataset.name);
    });
    sec.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('tr[data-name]')) open(e.target.dataset.name);
    });
    window.addEventListener('resize', debounce(() => { if (!sec.hidden) drawBars(); if (current) drawDetail(); }, 150));
    refresh();
  }

  function refresh() {
    if (!ctx) return;
    const nsel = base.filter(r => ctx.isSel(r.name)).length;
    if (!nsel && scope === 'sel') scope = 'all';
    $$('#st-scope').innerHTML = `<button data-scope="all" class="${scope === 'all' ? 'on' : ''}">All ${noun()}s (${base.length})</button>` +
      (nsel ? `<button data-scope="sel" class="${scope === 'sel' ? 'on' : ''}">Selected (${nsel})</button>` : '');
    rows = shown();
    const u = ctx.unitLabel();
    const cols = [['name', noun()[0].toUpperCase() + noun().slice(1), false], ['n', 'n', true], ['mse', 'MSE', true], ['mue', 'MUE', true], ['rmse', 'RMSE', true], ['sd', 'SD', true], ['max', 'Max |error|', true]];
    $$('#st-head').innerHTML = '<th class="chk" title="Show as a column in the table above"></th>' + cols.map(([k, label, isNum]) => {
      const on = sortKey === k;
      return `<th data-k="${k}" class="${isNum ? 'num ' : ''}sortable" aria-sort="${on ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}" title="${k === 'name' ? 'Sort by name' : 'Sort by ' + label}">${label}${isNum && k !== 'n' ? ` <small>(${u})</small>` : ''}<span class="arr">${on ? (sortDir > 0 ? '▲' : '▼') : ''}</span></th>`;
    }).join('');
    $$('#st-body').innerHTML = rows.map(r => {
      const sel = ctx.isSel(r.name), id = ctx.S.reactions[r.maxI] ? ctx.S.reactions[r.maxI].id : '';
      return `<tr data-name="${esc(r.name)}" tabindex="0" class="strow${sel ? ' sel' : ''}" title="Show plots">` +
        `<td class="chk"><label><input type="checkbox" data-sel="${esc(r.name)}" ${sel ? 'checked' : ''} aria-label="Show ${esc(r.name)} in the table"></label></td>` +
        `<td class="fname">${esc(r.name)}</td><td class="num">${r.n}${r.n < ctx.S.reactions.length ? `<small> / ${ctx.S.reactions.length}</small>` : ''}</td>` +
        `<td class="num">${num(r.mse, true)}</td><td class="num"><b>${num(r.mue)}</b></td><td class="num">${num(r.rmse)}</td><td class="num">${num(r.sd)}</td>` +
        `<td class="num" title="${esc(id)}">${num(r.max)}</td></tr>`;
    }).join('');
    drawBars();
    if (current) { order = rows.map(r => r.name); if (!order.includes(current)) order.push(current); drawDetail(); }
  }

  function drawBars() {
    const list = [...rows].sort((a, b) => a.mue - b.mue).slice(0, scope === 'sel' ? 25 : 20);
    const opts = AXIS_OPTS[ctx.unit];
    $$('#st-axis').innerHTML = `<button data-axis="-1" class="${axisIdx < 0 ? 'on' : ''}" title="Follow the data, at most ±10 kcal/mol">Auto</button>` +
      opts.map((v, i) => `<button data-axis="${i}" class="${axisIdx === i ? 'on' : ''}">${v}</button>`).join('');
    $$('#st-bartitle').textContent = `Distribution of the errors (${ctx.unitLabel()}), ${scope === 'sel' ? `selected ${noun()}s` : `${list.length} ${noun()}s with the lowest MUE`}, best first. Dot: median; bar: middle half of the errors; click a violin for details`;
    const res = violins($$('#st-bars'), list.map(r => {
      const vals = ctx.FD[r.name].filter(v => v != null).map(v => v * f()).sort((a, b) => a - b);
      return { label: r.name, vals, click: r.name, r };
    }));
    if (res && res.capped) $$('#st-bartitle').textContent += `. The axis stops at ±${+res.half.toFixed(2)} ${ctx.unitLabel()}; triangles mark errors beyond it`;
  }

  /* ------------------------------------------------------------ helpers */
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  const el = (tag, attrs = {}, html) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };

  function niceTicks(lo, hi, count = 5) {
    if (hi === lo) { hi = lo + 1; }
    const span = hi - lo, raw = span / count, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p;
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
    for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10));
    return { ticks: out, lo: a, hi: b, step };
  }
  const tickFmt = step => v => { const dd = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))); return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(dd); };

  // rectangle with the data end rounded (4px) and the baseline end square: end = 'top' | 'bottom' | 'left' | 'right'
  function rr(x, y, w, h, end, r = 4) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (end === 'top') return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (end === 'bottom') return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    if (end === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }

  // one shared tooltip: value first (strong), names after (secondary); built with textContent
  function tipEl() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'sttip'; tip.hidden = true; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(e, lines) {
    const t = tipEl(); t.textContent = '';
    lines.forEach((l, i) => { const s = document.createElement('div'); s.className = i === 0 ? 'tt-head' : 'tt-line'; s.textContent = l; t.appendChild(s); });
    t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { if (tip) tip.hidden = true; };
  function attachTips(svg, items) {
    svg.querySelectorAll('[data-t]').forEach(n => {
      const it = items[+n.dataset.t];
      n.addEventListener('pointermove', e => showTip(e, it.tip));
      n.addEventListener('pointerleave', hideTip);
      n.addEventListener('focus', () => { const r = n.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top }, it.tip); });
      n.addEventListener('blur', hideTip);
      if (it.click) { n.style.cursor = 'pointer'; n.addEventListener('click', () => open(it.click)); }
      if (it.href) { n.style.cursor = 'pointer'; n.addEventListener('click', () => { location.href = it.href; }); }
    });
  }

  /* ------------------------------------------------------------ horizontal bars (ranked, or signed from a zero line) */
  function hbars(host, items, o = {}) {
    host.textContent = '';
    if (!items.length) return;
    const W = Math.max(280, host.clientWidth || 600), pitch = 26, th = 14, top = 6, bot = 6;
    const maxLabel = Math.max(...items.map(i => i.label.length));
    const labW = Math.min(Math.round(W * 0.42), Math.round(maxLabel * 6.6 + 12));
    const vals = items.map(i => i.value);
    const lo = o.signed ? Math.min(0, ...vals) : 0, hi = Math.max(0, ...vals);
    const L = labW + 8 + (lo < 0 ? 58 : 0), R = W - (hi > 0 ? 64 : 10);   // room for the value label at each bar tip
    const span = hi - lo || 1;
    const x = v => L + ((v - lo) / span) * (R - L), x0 = x(0);
    const H = top + items.length * pitch + bot;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.aria || 'Bar chart' });
    items.forEach((it, i) => {
      const cy = top + i * pitch + pitch / 2, v = it.value;
      const cls = o.color === 'sign' ? (v >= 0 ? 'c-pos' : 'c-neg') : 'c-ser';
      const w = Math.max(1, Math.abs(x(v) - x0));
      const left = v >= 0 ? x0 : x0 - w;
      const lab = it.label.length * 6.6 + 12 > labW ? it.label.slice(0, Math.max(3, Math.floor((labW - 12) / 6.6) - 1)) + '…' : it.label;
      svg.appendChild(el('text', { x: labW, y: cy + 4, 'text-anchor': 'end', class: 'tx' }, esc(lab)));
      svg.appendChild(el('path', { d: rr(left, cy - th / 2, w, th, v >= 0 ? 'right' : 'left'), class: cls }));
      const tipX = v >= 0 ? x0 + w + 6 : x0 - w - 6;
      svg.appendChild(el('text', { x: tipX, y: cy + 4, 'text-anchor': v >= 0 ? 'start' : 'end', class: 'tx val' }, esc(o.valueText ? o.valueText(it) : (+v).toFixed(d()))));
      // hit target: the whole row
      svg.appendChild(el('rect', { x: 0, y: cy - pitch / 2, width: W, height: pitch, class: 'hit', 'data-t': i, tabindex: 0 }));
    });
    svg.insertBefore(el('line', { x1: x0, x2: x0, y1: top, y2: H - bot, class: 'axl' }), svg.firstChild);
    host.appendChild(svg);
    attachTips(svg, items);
  }

  /* ------------------------------------------------------------ violin plot: one distribution of signed errors per functional */
  const quant = (v, p) => { const x = (v.length - 1) * p, i = Math.floor(x); return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (x - i); };
  function violins(host, items) {
    host.textContent = '';
    if (!items.length) return;
    const W = Math.max(300, host.clientWidth || 640), pitch = 36, top = 8, axisH = 38;
    const maxLabel = Math.max(...items.map(i => i.label.length));
    const labW = Math.min(Math.round(W * 0.34), Math.round(maxLabel * 6.6 + 12)), L = labW + 12, R = W - 14;
    // Shared axis, centred on zero. It follows the data (pooled 0.5th-99.5th percentile) but never exceeds
    // +-10 kcal/mol, so outliers cannot squash every violin; values beyond the axis get an arrow.
    const pooled = items.flatMap(i => i.vals).sort((a, b) => a - b);
    const m = Math.max(Math.abs(quant(pooled, 0.005)), Math.abs(quant(pooled, 0.995)), 1e-9);
    const cap = AXIS_CAP_KCAL * f(), nice = niceTicks(0, m, 3).hi;
    const chosen = axisIdx >= 0 ? AXIS_OPTS[ctx.unit][axisIdx] : null;        // a range picked by the reader wins
    const half = chosen != null ? chosen : Math.min(nice, cap), capped = nice > half, lo = -half, hi = half;
    const tstep = niceTicks(lo, hi, 6).step, tcount = Math.floor(half / tstep + 1e-9);
    const xt = { step: tstep, ticks: Array.from({ length: 2 * tcount + 1 }, (_, i) => +((i - tcount) * tstep).toFixed(10)) };
    const x = v => L + ((v - lo) / (hi - lo)) * (R - L);
    const H = top + items.length * pitch + axisH;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Violin plot of the errors of each functional' });
    const xf = tickFmt(xt.step);
    xt.ticks.forEach(t => {
      svg.appendChild(el('line', { x1: x(t), x2: x(t), y1: top, y2: H - axisH, class: t === 0 ? 'axl' : 'grid' }));
      svg.appendChild(el('text', { x: x(t), y: H - axisH + 16, 'text-anchor': 'middle', class: 'tx mut' }, xf(t)));
    });
    svg.appendChild(el('text', { x: (L + R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tx mut' }, `Error (${ctx.unitLabel()}), calculated − reference`));
    const tips = [];
    items.forEach((it, i) => {
      const cy = top + i * pitch + pitch / 2, v = it.vals, n = v.length, half = pitch * 0.42;
      const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
      const q1 = quant(v, 0.25), med = quant(v, 0.5), q3 = quant(v, 0.75);
      let h = 0.9 * Math.min(sd || Infinity, (q3 - q1) / 1.34 || Infinity) * Math.pow(n, -0.2);   // Silverman's rule
      if (!isFinite(h) || h < (hi - lo) * 0.004) h = (hi - lo) * 0.004;
      const G = 70, ys = [];
      for (let g = 0; g <= G; g++) {
        const t = lo + (hi - lo) * g / G; let dens = 0;
        for (let j = 0; j < n; j++) { const z = (t - v[j]) / h; if (z > -4 && z < 4) dens += Math.exp(-0.5 * z * z); }
        ys.push([t, dens]);
      }
      const dmax = Math.max(...ys.map(p => p[1])) || 1;
      // drop the near-zero tails so no hairline runs along the whole axis
      const i0 = Math.max(0, ys.findIndex(p => p[1] / dmax >= 0.01) - 1);
      let i1 = ys.length - 1; while (i1 > 0 && ys[i1][1] / dmax < 0.01) i1--;
      const seg = ys.slice(i0, Math.min(ys.length, i1 + 2));
      const up = seg.map(([t, dd]) => `${x(t).toFixed(1)},${(cy - (dd / dmax) * half).toFixed(1)}`);
      const dn = seg.slice().reverse().map(([t, dd]) => `${x(t).toFixed(1)},${(cy + (dd / dmax) * half).toFixed(1)}`);
      svg.appendChild(el('path', { d: `M${up.join('L')}L${dn.join('L')}Z`, class: 'violin' }));
      // interquartile range and median (clipped to the axis)
      svg.appendChild(el('line', { x1: x(Math.max(lo, q1)), x2: x(Math.min(hi, q3)), y1: cy, y2: cy, class: 'iqr' }));
      if (med >= lo && med <= hi) svg.appendChild(el('circle', { cx: x(med), cy, r: 4, class: 'med' }));
      const out = v.filter(t => t < lo || t > hi).length;
      if (v[0] < lo) svg.appendChild(el('path', { d: `M${L + 1},${cy}l7,-5v10z`, class: 'more' }));
      if (v[n - 1] > hi) svg.appendChild(el('path', { d: `M${R - 1},${cy}l-7,-5v10z`, class: 'more' }));
      const lab = it.label.length * 6.6 + 12 > labW ? it.label.slice(0, Math.max(3, Math.floor((labW - 12) / 6.6) - 1)) + '…' : it.label;
      svg.appendChild(el('text', { x: labW, y: cy + 4, 'text-anchor': 'end', class: 'tx' }, esc(lab)));
      const u = ctx.unitLabel(), g = k => (+k).toFixed(d());
      tips.push({ click: it.click, tip: [it.label, `MUE ${g(it.r.mue * f())} ${u}`, `median ${g(med)}, mean ${g(mean)} ${u}`, `middle half ${g(q1)} to ${g(q3)}`, `range ${g(v[0])} to ${g(v[n - 1])}${out ? ` (${out} beyond the axis)` : ''}`, `n = ${n}`] });
      svg.appendChild(el('rect', { x: 0, y: cy - pitch / 2, width: W, height: pitch, class: 'hit', 'data-t': i, tabindex: 0 }));
    });
    host.appendChild(svg);
    attachTips(svg, tips);
    return { capped, half };
  }

  /* ------------------------------------------------------------ histogram */
  function histogram(host, errs, mse) {
    host.textContent = '';
    const W = Math.max(280, host.clientWidth || 600), H = 230, m = { l: 46, r: 14, t: 14, b: 46 };
    let lo = Math.min(0, ...errs), hi = Math.max(0, ...errs);
    const target = Math.max(5, Math.min(30, Math.round(Math.sqrt(errs.length))));
    const xt = niceTicks(lo, hi, 6); lo = xt.lo; hi = xt.hi;
    const bw = xt.step / Math.max(1, Math.round(target * xt.step / (hi - lo)));   // an integer fraction of the tick step, so 0 is a bin edge
    const k = Math.max(1, Math.round((hi - lo) / bw)), counts = new Array(k).fill(0);
    errs.forEach(v => { counts[Math.min(k - 1, Math.max(0, Math.floor((v - lo) / bw + 1e-9)))]++; });
    const yt = niceTicks(0, Math.max(...counts), 4);
    const px = v => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r), py = v => H - m.b - (v / yt.hi) * (H - m.t - m.b);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Histogram of errors' });
    const yf = tickFmt(yt.step), xf = tickFmt(xt.step);
    yt.ticks.forEach(t => {
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), class: t === 0 ? 'axl' : 'grid' }));
      svg.appendChild(el('text', { x: m.l - 8, y: py(t) + 4, 'text-anchor': 'end', class: 'tx mut' }, yf(t)));
    });
    xt.ticks.forEach(t => svg.appendChild(el('text', { x: px(t), y: H - m.b + 18, 'text-anchor': 'middle', class: 'tx mut' }, xf(t))));
    svg.appendChild(el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tx mut' }, `Error (${ctx.unitLabel()})`));
    svg.appendChild(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle', class: 'tx mut' }, 'Reactions'));
    const items = [], itemOf = {};
    counts.forEach((c, i) => {
      if (!c) return;
      const a = lo + i * bw, b = a + bw, x1 = px(a) + 1, x2 = px(b) - 1, y = py(c);
      itemOf[i] = items.length;
      items.push({ tip: [`${c} reaction${c > 1 ? 's' : ''}`, `error ${(+a.toFixed(6))} to ${(+b.toFixed(6))} ${ctx.unitLabel()}`] });
      svg.appendChild(el('path', { d: rr(x1, y, Math.max(1, x2 - x1), py(0) - y, 'top'), class: a + bw / 2 >= 0 ? 'c-pos' : 'c-neg' }));
    });
    // hit columns for every bin (bigger than the painted bar)
    counts.forEach((c, i) => {
      if (!c) return;
      svg.appendChild(el('rect', { x: px(lo + i * bw), y: m.t, width: px(lo + (i + 1) * bw) - px(lo + i * bw), height: H - m.t - m.b, class: 'hit', 'data-t': itemOf[i], tabindex: 0 }));
    });
    // mean signed error marker
    const mx = px(mse);
    svg.appendChild(el('line', { x1: mx, x2: mx, y1: m.t - 4, y2: H - m.b, class: 'mark' }));
    svg.appendChild(el('text', { x: Math.min(W - m.r - 4, Math.max(m.l + 4, mx)), y: m.t - 5, 'text-anchor': mx > W - 80 ? 'end' : 'start', class: 'tx' }, `MSE ${(mse).toFixed(d())}`));
    host.appendChild(svg);
    attachTips(svg, items);
  }

  /* ------------------------------------------------------------ error of every reaction (signed columns) */
  function perReaction(host, errs, ids, refs) {
    host.textContent = '';
    const idx = errs.map((v, i) => i).filter(i => errs[i] != null);
    const W = Math.max(280, host.clientWidth || 600), H = 240, m = { l: 46, r: 14, t: 12, b: 40 };
    const vals = idx.map(i => errs[i]);
    const yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
    const py = v => m.t + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * (H - m.t - m.b);
    const step = (W - m.l - m.r) / idx.length, bwid = Math.max(1, Math.min(14, step - (step > 4 ? 2 : 0)));
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Error of each reaction' });
    const yf = tickFmt(yt.step);
    yt.ticks.forEach(t => {
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), class: t === 0 ? 'axl' : 'grid' }));
      svg.appendChild(el('text', { x: m.l - 8, y: py(t) + 4, 'text-anchor': 'end', class: 'tx mut' }, yf(t)));
    });
    svg.appendChild(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle', class: 'tx mut' }, `Error (${ctx.unitLabel()})`));
    svg.appendChild(el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tx mut' }, `Reactions, in the order of the table above (${idx.length})`));
    const items = [];
    idx.forEach((i, j) => {
      const v = errs[i], cx = m.l + step * (j + 0.5), y0 = py(0), y1 = py(v), h = Math.abs(y1 - y0);
      items.push({ tip: [`${v > 0 ? '+' : ''}${v.toFixed(d())} ${ctx.unitLabel()}`, ids[i], `reference ${refs[i]}`] });
      svg.appendChild(el('path', { d: rr(cx - bwid / 2, Math.min(y0, y1), bwid, Math.max(1, h), v >= 0 ? 'top' : 'bottom', Math.min(4, bwid / 2)), class: v >= 0 ? 'c-pos' : 'c-neg' }));
    });
    idx.forEach((i, j) => svg.appendChild(el('rect', { x: m.l + step * j, y: m.t, width: Math.max(step, 2), height: H - m.t - m.b, class: 'hit', 'data-t': j, tabindex: step > 6 ? 0 : -1 })));
    host.appendChild(svg);
    attachTips(svg, items);
  }

  /* ------------------------------------------------------------ detail dialog */
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'statmodal'; modal.hidden = true;
    modal.innerHTML = `<div class="statpanel" role="dialog" aria-modal="true" aria-labelledby="sm-title">
      <header><div><h3 id="sm-title"></h3><div class="sm-sub" id="sm-sub"></div></div>
        <div class="sm-nav"><button class="btn" id="sm-prev" title="Previous functional (←)">‹</button><button class="btn" id="sm-next" title="Next functional (→)">›</button><button class="x" id="sm-close" aria-label="Close" title="Close (Esc)">×</button></div></header>
      <div class="sm-body">
        <div class="tiles" id="sm-tiles"></div>
        <div class="legend" id="sm-leg1"><span><i class="sw c-neg"></i>Underestimated (calculated &lt; reference)</span><span><i class="sw c-pos"></i>Overestimated (calculated &gt; reference)</span></div>
        <h4 id="sm-per-h">Error of each reaction</h4><div id="sm-per"></div>
        <div class="legend" id="sm-leg2" hidden><span><i class="sw c-neg"></i>Underestimated (calculated &lt; reference)</span><span><i class="sw c-pos"></i>Overestimated (calculated &gt; reference)</span></div>
        <h4>Distribution of the errors</h4><div id="sm-hist"></div>
        <h4>Ten largest errors</h4><div id="sm-top"></div>
      </div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', e => { if (e.target === modal) close(); });
    $$('#sm-close', modal).onclick = close;
    $$('#sm-prev', modal).onclick = () => step(-1);
    $$('#sm-next', modal).onclick = () => step(1);
    document.addEventListener('keydown', e => {
      if (modal.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
  }
  function step(dir) {
    const i = order.indexOf(current);
    if (i >= 0) { current = order[(i + dir + order.length) % order.length]; drawDetail(); }
  }
  function open(name) {
    if (!modal) buildModal();
    order = rows.map(r => r.name);
    current = name;
    modal.hidden = false; document.body.classList.add('modal-open');
    drawDetail();
    $$('#sm-close', modal).focus({ preventScroll: true });
  }
  function close() { if (!modal) return; modal.hidden = true; current = null; hideTip(); document.body.classList.remove('modal-open'); }

  function drawDetail() {
    if (!current || !modal || modal.hidden) return;
    const r = base.find(b => b.name === current), arr = ctx.FD[current], S = ctx.S, u = ctx.unitLabel();
    $$('#sm-title', modal).textContent = current;
    $$('#sm-sub', modal).textContent = `${S.name} · ${r.n} of ${S.reactions.length} ${S.property ? 'molecules' : 'reactions'} · errors in ${u} (calculated − reference)`;
    const id = S.reactions[r.maxI] ? S.reactions[r.maxI].id : '';
    const tile = (label, val, small) => `<div class="tile"><span>${label}</span><b>${val}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>`;
    $$('#sm-tiles', modal).innerHTML = tile('MUE', num(r.mue)) + tile('MSE', num(r.mse, true)) + tile('RMSE', num(r.rmse)) + tile('SD', num(r.sd)) + tile('Max |error|', num(r.max), id);
    const sc = arr.map(v => (v == null ? null : v * f()));
    const idx = sc.map((v, i) => i).filter(i => sc[i] != null);
    const ids = S.reactions.map(x => x.id), refs = S.reactions.map(x => x.ref[ctx.unit].toFixed(d()));
    $$('#sm-leg1', modal).hidden = !!ctx.groups; $$('#sm-leg2', modal).hidden = !ctx.groups;
    if (ctx.groups) {
      // database level: the MUE of each subset instead of thousands of single reactions
      const gw = ctx.groupWord || 'subset';
      $$('#sm-per-h', modal).textContent = `Mean unsigned error of each ${gw} (${u}); click a bar to open the ${gw}`;
      const g = ctx.groups, sum = new Array(g.names.length).fill(0), cnt = new Array(g.names.length).fill(0);
      idx.forEach(i => { sum[g.idx[i]] += Math.abs(sc[i]); cnt[g.idx[i]]++; });
      const items = g.names.map((nm, k) => ({ label: nm, value: cnt[k] ? sum[k] / cnt[k] : NaN, k })).filter(it => !isNaN(it.value)).sort((a, b) => b.value - a.value);
      hbars($$('#sm-per', modal), items.map(it => ({ label: it.label, value: it.value, href: `subset.html?id=${encodeURIComponent(g.ids[it.k])}`, tip: [`${it.value.toFixed(d())} ${u}`, it.label, `${cnt[it.k]} reaction${cnt[it.k] === 1 ? '' : 's'}`, `Click to open this ${gw}`] })),
        { color: 'ser', signed: false, aria: 'Mean unsigned error of each subset' });
    } else {
      perReaction($$('#sm-per', modal), sc, ids, refs);
    }
    histogram($$('#sm-hist', modal), idx.map(i => sc[i]), r.mse * f());
    const top = [...idx].sort((a, b) => Math.abs(sc[b]) - Math.abs(sc[a])).slice(0, 10);
    hbars($$('#sm-top', modal), top.map(i => ({ label: ids[i], value: sc[i], tip: [`${sc[i] > 0 ? '+' : ''}${sc[i].toFixed(d())} ${u}`, ids[i], `reference ${refs[i]}`] })),
      { color: 'sign', signed: true, valueText: it => (it.value > 0 ? '+' : '') + it.value.toFixed(d()), aria: 'Ten largest errors' });
  }

  return { mount, refresh };
})();
