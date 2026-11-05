/* Shared helpers + 3D molecule viewer for the ACCDB site. */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return r.json();
}

const xyzURL = file => 'xyz/' + encodeURIComponent(file) + '.xyz';
const xyzCache = new Map();
async function loadXYZ(file) {
  if (!xyzCache.has(file)) {
    const r = await fetch(xyzURL(file));
    if (!r.ok) throw new Error('geometry not found');
    xyzCache.set(file, await r.text());
  }
  return xyzCache.get(file);
}

function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* some ACCDB xyz files label atoms by atomic number; 3Dmol needs symbols */
const ELEMENTS = ('X H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm').split(' ');
function normalizeXYZ(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 2; i < lines.length; i++) {
    const m = /^(\s*)(\d+)(\s+.*)$/.exec(lines[i]);
    if (m && ELEMENTS[+m[2]]) lines[i] = m[1] + ELEMENTS[+m[2]] + m[3];
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------- viewer
   One persistent viewer ("dock") that is never hidden with display:none (Safari does not
   repaint WebGL canvases that were display:none). It shows the selected molecule live;
   the expand button enlarges the same viewer in place. */
const Viewer = (() => {
  let dock, backdrop, viewer, current = null, selected = null;
  let style = 'ballstick', spinning = false, labels = false, big = false, token = 0;

  function init() {
    if (dock) return;
    backdrop = document.createElement('div');
    backdrop.className = 'dock-backdrop';
    document.body.appendChild(backdrop);
    dock = document.createElement('div');
    dock.className = 'dock';
    dock.innerHTML = `
      <div class="dock-head">
        <span class="dock-name" id="vname">Click a molecule to preview it</span>
        <button class="dock-btn" id="vexp" title="Enlarge" aria-label="Enlarge viewer">⤢</button>
        <button class="dock-btn" id="vmin" title="Minimize" aria-label="Minimize viewer">–</button>
      </div>
      <div class="dock-body">
        <div id="viewer"></div>
        <pre id="xyztext" aria-label="xyz file contents"></pre>
        <div class="vmsg" id="vmsg">3D preview</div>
      </div>
      <div class="dock-info" id="vinfo"></div>
      <div class="dock-tools">
        <select class="btn" id="vstyle" aria-label="Display style">
          <option value="ballstick">Ball &amp; stick</option>
          <option value="stick">Sticks</option>
          <option value="sphere">Space-filling</option>
          <option value="line">Wireframe</option>
        </select>
        <button class="btn" id="vspin">Spin</button>
        <button class="btn" id="vlabels">Labels</button>
        <button class="btn" id="vreset">Reset view</button>
        <button class="btn" id="vtxt">View .xyz</button>
        <button class="btn" id="vinp" title="Q-Chem, ORCA or Gaussian input file">Input file…</button>
        <button class="btn primary" id="vdl">Download .xyz</button>
        <span class="hint">drag to rotate · scroll to zoom · shift-drag to move</span>
      </div>`;
    document.body.appendChild(dock);
    dock.classList.add('min');   // starts collapsed to its title bar until a molecule is selected
    document.body.classList.add('has-dock');

    viewer = $3Dmol.createViewer($('#viewer', dock), { backgroundColor: bg() });
    viewer.render();

    $('#vexp', dock).onclick = () => setBig(!big);
    $('.dock-body', dock).addEventListener('dblclick', () => { if (!big) setBig(true); });
    $('#vmin', dock).onclick = () => { dock.classList.toggle('min'); setTimeout(refresh, 0); };
    backdrop.onclick = () => setBig(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && big) setBig(false); });
    $('#vstyle', dock).onchange = e => { style = e.target.value; applyStyle(); };
    $('#vspin', dock).onclick = () => { spinning = !spinning; viewer.spin(spinning ? 'y' : false); $('#vspin', dock).textContent = spinning ? 'Stop' : 'Spin'; };
    $('#vlabels', dock).onclick = () => { labels = !labels; applyLabels(); };
    $('#vreset', dock).onclick = () => { viewer.zoomTo(); viewer.render(); };
    $('#vtxt', dock).onclick = () => setText(!dock.classList.contains('showtext'));
    $('#vdl', dock).onclick = () => { if (current) download(current.file + '.xyz', new Blob([current.text], { type: 'chemical/x-xyz' })); };
    $('#vinp', dock).onclick = () => { if (current && typeof InputFiles !== 'undefined') InputFiles.open({ mols: [{ name: selected, file: current.file }], title: selected, single: true }); };
    window.addEventListener('resize', refresh);
  }

  const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg').trim() || '#f4f5f9';

  // resize the canvas after any layout change, then repaint
  function refresh() {
    requestAnimationFrame(() => { viewer.resize(); viewer.render(); requestAnimationFrame(() => { viewer.resize(); viewer.render(); }); });
  }

  // show the raw .xyz text on top of the 3D view (the viewer stays rendered underneath)
  function setText(on) {
    dock.classList.toggle('showtext', on);
    $('#vtxt', dock).textContent = on ? 'View 3D' : 'View .xyz';
    $('#xyztext', dock).scrollTop = 0;
  }

  function setBig(b) {
    big = b;
    if (!b) setText(false);
    dock.classList.toggle('big', b);
    dock.classList.remove('min');
    backdrop.classList.toggle('on', b);
    $('#vexp', dock).textContent = b ? '✕' : '⤢';
    $('#vexp', dock).title = b ? 'Close (Esc)' : 'Enlarge';
    document.body.style.overflow = b ? 'hidden' : '';
    refresh();
  }

  function formula(atoms) {
    const c = {};
    atoms.forEach(a => { c[a.elem] = (c[a.elem] || 0) + 1; });
    const keys = Object.keys(c);
    const order = keys.includes('C') ? ['C', 'H', ...keys.filter(k => k !== 'C' && k !== 'H').sort()] : keys.sort();
    const sub = '₀₁₂₃₄₅₆₇₈₉';
    return order.map(k => k + (c[k] > 1 ? String(c[k]).replace(/\d/g, d => sub[d]) : '')).join('');
  }

  function applyStyle() {
    const s = {
      ballstick: { stick: { radius: 0.14, colorscheme: 'Jmol' }, sphere: { scale: 0.26, colorscheme: 'Jmol' } },
      stick: { stick: { radius: 0.18, colorscheme: 'Jmol' } },
      sphere: { sphere: { scale: 0.9, colorscheme: 'Jmol' } },
      line: { line: { colorscheme: 'Jmol' } },
    }[style];
    viewer.setStyle({}, s);
    viewer.render();
  }
  function applyLabels() {
    viewer.removeAllLabels();
    if (labels && current) {
      viewer.getModel().selectedAtoms({}).forEach((a, i) => viewer.addLabel(a.elem + (i + 1), {
        position: a, fontSize: 11, fontColor: '#222', backgroundColor: '#ffffff', backgroundOpacity: 0.65, borderThickness: 0, inFront: true, showBackground: true,
      }));
    }
    $('#vlabels', dock).style.borderColor = labels ? 'var(--accent)' : '';
    viewer.render();
  }

  function message(t) { const m = $('#vmsg', dock); m.textContent = t; m.style.visibility = t ? 'visible' : 'hidden'; }

  // select a molecule: update the live viewer (click the selected one again to enlarge)
  async function select(name, file) {
    init();
    if (selected === name && current) { setBig(true); return; }
    selected = name;
    const my = ++token;
    $('#vname', dock).textContent = name;
    $('#vname', dock).title = name;
    dock.classList.remove('min');
    document.querySelectorAll('.mol.sel').forEach(b => b.classList.remove('sel'));
    document.querySelectorAll('.mol').forEach(b => { if (b.dataset.m === name) b.classList.add('sel'); });
    current = null;
    $('#xyztext', dock).textContent = '';
    viewer.spin(false);
    viewer.removeAllLabels();
    viewer.removeAllModels();
    viewer.render();
    $('#vinfo', dock).textContent = '';
    if (!file) { message('No geometry file is available for this molecule in ACCDB.'); return; }
    message('Loading…');
    let text;
    try { text = await loadXYZ(file); } catch (e) { if (my === token) message('Could not load the geometry file.'); return; }
    if (my !== token) return;            // a newer selection superseded this one
    try {
      current = { file, text };
      $('#xyztext', dock).textContent = text;
      viewer.addModel(normalizeXYZ(text), 'xyz');
      applyStyle(); applyLabels();
      viewer.zoomTo();
      viewer.spin(spinning ? 'y' : false);
      message('');
      refresh();
    } catch (e) { current = null; message('Could not display this structure.'); return; }
    const cm = ((/^\s*([+-]?\d+)[\s,]+([+-]?\d+)\s*$/.exec(text.split(/\r?\n/)[1] || '') || []).slice(1)).map(x => String(parseInt(x, 10)));
    const atoms = viewer.getModel().selectedAtoms({});
    let info = `${formula(atoms)} · ${atoms.length} atoms`;
    if (cm.length === 2 && cm.every(x => /^-?\d+$/.test(x))) info += ` · charge ${cm[0]} · mult. ${cm[1]}`;
    $('#vinfo', dock).textContent = info;
  }

  return { init, select };
})();
