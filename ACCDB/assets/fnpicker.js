/* The "Functionals" drop-down: a searchable checklist of exchange-correlation functionals.
   Shared by the subset pages and the database pages.

   FnPicker.mount(hostElement, {
     names,                 // all functional names
     mue: name => kcal MUE, // shown next to each name (scaled by factor())
     factor(), decs(), unitLabel(),
     getSel(): [names],     // current selection
     onToggle(name, on), onClear(),
     modes: true|false, onMode(mode)   // optional "Errors | Values" switch
     footer: html           // note at the bottom of the menu
   }) -> { refresh() }       // call after the selection or the unit changed
*/
const FnPicker = (() => {
  function mount(host, o) {
    let sort = 'name';
    host.innerHTML = `
      <button class="btn fnbtn" aria-haspopup="true" aria-expanded="false">${o.label || 'Functionals'} <span class="badge" hidden></span> ▾</button>
      <div class="fnmenu" hidden>
        <input class="search fnq" type="search" placeholder="Search ${o.names.length} ${(o.label || 'Functionals').toLowerCase()}…" autocomplete="off">
        <div class="fnbar">
          ${o.modes ? '<span class="seg seg-mode" title="What to show in the columns"><button data-mode="err" class="on">Errors</button><button data-mode="val">Values</button></span>' : ''}
          <span class="seg seg-sort" title="Order of the list"><button data-sort="name" class="on">A–Z</button><button data-sort="mue">By MUE</button></span>
          <button class="link fnclear">Clear</button>
        </div>
        <div class="fnlist"></div>
        <div class="fnfoot">${o.footer || ''}</div>
      </div>`;
    const q = s => host.querySelector(s);
    const btn = q('.fnbtn'), menu = q('.fnmenu'), list = q('.fnlist'), search = q('.fnq'), badge = q('.badge');

    function renderList() {
      const sel = o.getSel(), f = search.value.trim().toLowerCase();
      const names = o.names.filter(n => !f || n.toLowerCase().includes(f));
      names.sort(sort === 'mue' ? (a, b) => o.mue(a) - o.mue(b) || a.localeCompare(b) : (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      list.innerHTML = names.map(n =>
        `<label class="fnitem"><input type="checkbox" value="${esc(n)}" ${sel.includes(n) ? 'checked' : ''}><span class="fnname">${esc(n)}</span><span class="fnmue" title="MUE (${o.unitLabel()})">${(o.mue(n) * o.factor()).toFixed(o.decs())}</span></label>`).join('')
        || '<div class="fnempty">No functional matches.</div>';
    }
    function refresh() {
      renderList();
      const n = o.getSel().length;
      badge.hidden = !n; badge.textContent = n;
    }
    function open(on) {
      menu.hidden = !on; btn.setAttribute('aria-expanded', on);
      if (on) search.focus({ preventScroll: true });
    }
    btn.onclick = e => { e.stopPropagation(); open(menu.hidden); };
    document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.fnpick')) open(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); } });
    search.addEventListener('input', renderList);
    list.addEventListener('change', e => { o.onToggle(e.target.value, e.target.checked); });
    q('.fnclear').onclick = () => o.onClear();
    q('.seg-sort').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      sort = b.dataset.sort; [...q('.seg-sort').children].forEach(x => x.classList.toggle('on', x === b)); renderList();
    });
    if (o.modes) q('.seg-mode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      [...q('.seg-mode').children].forEach(x => x.classList.toggle('on', x === b)); o.onMode(b.dataset.mode);
    });
    host.hidden = false;
    refresh();
    return { refresh };
  }
  return { mount };
})();
