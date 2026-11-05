/* Q-Chem / ORCA / Gaussian input files for the structures of ACCDB and ASCDB (needs app.js).
   InputFiles.open({ mols: [{name, file}], title, zipName, cite, single }) opens a dialog in which the
   user chooses the program, a method preset (or any keywords) and the resources; the files are built in the browser. */
const InputFiles = (() => {
  const PROGRAMS = {
    qchem: { name: 'Q-Chem', ext: 'in', hint: 'Content of the $rem section, one keyword per line, e.g.\nmethod wb97x-v\nbasis def2-tzvpp' },
    orca: { name: 'ORCA', ext: 'inp', hint: 'Keyword lines starting with !, and any % blocks, e.g.\n! wB97X-V def2-TZVPP TightSCF' },
    gaussian: { name: 'Gaussian', ext: 'com', hint: 'The route section starting with #, e.g.\n#p B3LYP/def2TZVP' },
  };
  // a preset with no entry for a program is not offered for it (e.g. wB97M-V does not exist in Gaussian)
  const PRESETS = [
    { id: 'hf', label: 'HF / def2-TZVP',
      qchem: 'method hf\nbasis def2-tzvp\nscf_convergence 8', orca: '! HF def2-TZVP TightSCF', gaussian: '#p HF/def2TZVP' },
    { id: 'b3lyp', label: 'B3LYP-D3(BJ) / def2-TZVP',
      qchem: 'method b3lyp\nbasis def2-tzvp\ndft_d d3_bj\nscf_convergence 8', orca: '! B3LYP D3BJ def2-TZVP TightSCF', gaussian: '#p B3LYP/def2TZVP EmpiricalDispersion=GD3BJ' },
    { id: 'pbe0', label: 'PBE0-D3(BJ) / def2-TZVP',
      qchem: 'method pbe0\nbasis def2-tzvp\ndft_d d3_bj\nscf_convergence 8', orca: '! PBE0 D3BJ def2-TZVP TightSCF', gaussian: '#p PBE1PBE/def2TZVP EmpiricalDispersion=GD3BJ' },
    { id: 'wb97xv', label: 'ωB97X-V / def2-TZVPP',
      qchem: 'method wb97x-v\nbasis def2-tzvpp\nscf_convergence 8', orca: '! wB97X-V def2-TZVPP TightSCF' },
    { id: 'wb97mv', label: 'ωB97M-V / def2-TZVPP',
      qchem: 'method wb97m-v\nbasis def2-tzvpp\nscf_convergence 8', orca: '! wB97M-V def2-TZVPP TightSCF' },
    { id: 'mp2', label: 'MP2 / def2-TZVPP',
      qchem: 'method mp2\nbasis def2-tzvpp\nscf_convergence 8', orca: '! RI-MP2 def2-TZVPP def2-TZVPP/C TightSCF', gaussian: '#p MP2/def2TZVPP' },
    { id: 'ccsdt', label: 'CCSD(T) / def2-TZVPP',
      qchem: 'method ccsd(t)\nbasis def2-tzvpp\nscf_convergence 8', orca: '! CCSD(T) def2-TZVPP TightSCF', gaussian: '#p CCSD(T)/def2TZVPP' },
  ];
  const JOBS = { sp: 'Single point', opt: 'Geometry optimisation', freq: 'Frequencies', optfreq: 'Optimisation + frequencies' };

  /* ------------------------------------------------------------ parsing and writing (no DOM) */
  // the charge and multiplicity are on the second line of every xyz file; a few files write them as "+1, 2"
  const CM = /^\s*([+-]?\d+)[\s,]+([+-]?\d+)\s*$/;
  function parseXYZ(text) {
    const L = text.split(/\r?\n/);
    const n = parseInt(L[0], 10);
    const cm = CM.exec(L[1] || '');
    if (!cm) return { error: 'no valid "charge multiplicity" on the second line of the xyz file (found "' + (L[1] || '').trim() + '")' };
    const charge = parseInt(cm[1], 10), mult = parseInt(cm[2], 10);
    if (mult < 1) return { error: 'multiplicity ' + mult + ' is not valid' };
    const atoms = [];
    let electrons = -charge;
    for (const line of L.slice(2)) {
      if (!line.trim()) continue;
      const t = line.trim().split(/\s+/);
      if (t.length < 4 || t.slice(1, 4).some(v => !isFinite(+v))) return { error: 'cannot read the atom line "' + line.trim() + '"' };
      const el = /^\d+$/.test(t[0]) ? ELEMENTS[+t[0]] : t[0][0].toUpperCase() + t[0].slice(1).toLowerCase();
      const Z = ELEMENTS.indexOf(el);
      if (!el || Z < 1) return { error: 'unknown element "' + t[0] + '"' };
      electrons += Z;
      atoms.push({ el, xyz: t.slice(1, 4) });
    }
    if (!atoms.length) return { error: 'no atoms' };
    const warn = [];
    // the atom lines are used as they are; a wrong count in the first line is only reported
    if (!isFinite(n) || n !== atoms.length) warn.push(`the first line announces ${n} atoms but ${atoms.length} are listed`);
    if (electrons % 2 !== (mult - 1) % 2) warn.push(`${electrons} electrons are not compatible with multiplicity ${mult} (charge ${charge}); check the file`);
    return { charge, mult, atoms, warn };
  }

  // o: { kw, job, cores, mem (GB, total), chk }; returns { text, notes }
  function build(prog, name, mol, o) {
    const kw = (o.kw || '').replace(/\s+$/, '');
    const has = re => re.test(kw);
    const cores = Math.max(1, Math.round(+o.cores) || 1), mem = +o.mem > 0 ? +o.mem : 0;
    const coords = mol.atoms.map(a => `${a.el.padEnd(2)} ${a.xyz.join(' ')}`).join('\n');
    const notes = [];
    const wantOpt = o.job === 'opt' || o.job === 'optfreq', wantFreq = o.job === 'freq' || o.job === 'optfreq';
    let text = '';
    if (prog === 'qchem') {
      const rem = [kw];
      if (wantOpt || wantFreq) {
        if (!has(/^\s*jobtype/im)) rem.push('jobtype ' + (o.job === 'optfreq' ? 'opt' : wantOpt ? 'opt' : 'freq'));
        if (o.job === 'optfreq') notes.push('Q-Chem has no combined job: this file optimises only; run a frequency job on the optimised geometry afterwards.');
      }
      if (mol.mult > 1 && !has(/^\s*unrestricted/im)) { rem.push('unrestricted true'); notes.push(`Open shell (multiplicity ${mol.mult}): added "unrestricted true".`); }
      if (mem && !has(/^\s*mem_total/im)) rem.push('mem_total ' + Math.round(mem * 1000));
      text = `$comment\n${name}\nRun with: qchem -nt ${cores} ${name}.in ${name}.out\n$end\n\n$molecule\n${mol.charge} ${mol.mult}\n${coords}\n$end\n\n$rem\n${rem.join('\n')}\n$end\n`;
    } else if (prog === 'orca') {
      const head = [kw];
      if (wantOpt && !has(/^\s*!.*\b(opt|tightopt|looseopt)\b/im)) head.push('! Opt');
      if (wantFreq && !has(/^\s*!.*\b(freq|numfreq)\b/im)) head.push('! Freq');
      if (cores > 1 && !has(/^\s*%pal/im)) head.push(`%pal nprocs ${cores} end`);
      if (mem && !has(/^\s*%maxcore/im)) head.push(`%maxcore ${Math.round(mem * 1000 / cores)}`);
      if (mol.mult > 1) notes.push(`Open shell (multiplicity ${mol.mult}): ORCA switches to an unrestricted reference by itself.`);
      text = `# ${name}\n${head.join('\n')}\n* xyz ${mol.charge} ${mol.mult}\n${coords}\n*\n`;
    } else {
      const link0 = [];
      if (!has(/^\s*%nproc/im)) link0.push('%NProcShared=' + cores);
      if (mem && !has(/^\s*%mem/im)) link0.push('%Mem=' + (Number.isInteger(mem) ? mem + 'GB' : Math.round(mem * 1000) + 'MB'));
      if (o.chk && !has(/^\s*%chk/im)) link0.push(`%Chk=${name}.chk`);
      let route = kw.split('\n');
      const ri = route.findIndex(l => l.trim().startsWith('#'));
      if (ri >= 0) {
        const add = [];
        if (wantOpt && !/\bopt\b/i.test(kw)) add.push('Opt');
        if (wantFreq && !/\bfreq\b/i.test(kw)) add.push('Freq');
        if (add.length) route[ri] += ' ' + add.join(' ');
      }
      if (mol.mult > 1) notes.push(`Open shell (multiplicity ${mol.mult}): Gaussian picks an unrestricted reference by itself.`);
      text = `${[...link0, ...route].join('\n')}\n\n${name}\n\n${mol.charge} ${mol.mult}\n${coords}\n\n`;
    }
    return { text, notes };
  }

  /* ------------------------------------------------------------ dialog */
  const KEY = 'chemdb.inputs';           // shared by ACCDB and ASCDB (same origin)
  const defaults = () => ({ prog: 'qchem', preset: { qchem: 'wb97xv', orca: 'wb97xv', gaussian: 'b3lyp' }, kw: {}, job: 'sp', cores: 4, mem: 8, chk: false });
  let ST = defaults();
  try { ST = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
  const presetText = (id, prog) => (PRESETS.find(p => p.id === id) || {})[prog];

  let modal = null, onKey = null;

  function open(cfg) {
    close();
    const mols = (cfg.mols || []).filter(m => m.file);
    const single = !!cfg.single || mols.length === 1;
    if (!mols.length) { alert('No geometry files are available here.'); return; }
    modal = document.createElement('div');
    modal.className = 'statmodal';
    modal.innerHTML = `<div class="statpanel" role="dialog" aria-modal="true" aria-labelledby="if-title">
      <header><div><h3 id="if-title">Input files</h3><div class="sm-sub">${esc(cfg.title || '')} · ${single ? 'one molecule' : mols.length.toLocaleString() + ' molecules, one file each'}</div></div>
        <button class="x" id="if-close" aria-label="Close" title="Close (Esc)">×</button></header>
      <div class="sm-body">
        <div class="inp-row">
          <label>Program<select class="btn" id="if-prog">${Object.entries(PROGRAMS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')}</select></label>
          <label>Method preset<select class="btn" id="if-preset"></select></label>
          <label>Job<select class="btn" id="if-job">${Object.entries(JOBS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Cores<input class="btn inp-num" id="if-cores" type="number" min="1" step="1"></label>
          <label>Memory (GB, total)<input class="btn inp-num" id="if-mem" type="number" min="0" step="1"></label>
          <label class="inp-chk" id="if-chkl"><span><input type="checkbox" id="if-chk"> checkpoint file</span></label>
        </div>
        <label class="inp-kwl">Keywords <span id="if-kwhint">(edit freely: any method, basis set or program option)</span>
          <textarea id="if-kw" class="inp-kw" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></label>
        <p class="inp-note">Make sure the method and basis set are defined for every element of the molecules (the transition-metal and actinide systems need suitable basis sets / ECPs). Charge, multiplicity and coordinates are taken from each structure.</p>
        <div class="inp-warn" id="if-warn" hidden></div>
        <div class="inp-pvh"><h4>Preview</h4>${single ? '' : '<select class="btn" id="if-mol" aria-label="Molecule to preview"></select>'}</div>
        <pre class="inp-prev" id="if-prev"></pre>
        <div class="inp-foot"><button class="btn" id="if-copy">Copy preview</button><button class="btn primary" id="if-dl"></button></div>
      </div></div>`;
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    const g = id => $('#' + id, modal);
    const molSel = g('if-mol');
    if (molSel) molSel.innerHTML = mols.map((m, i) => `<option value="${i}">${esc(m.name)}</option>`).join('');
    modal.addEventListener('mousedown', e => { if (e.target === modal) close(); });
    g('if-close').onclick = close;
    onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);

    const prog = () => ST.prog;
    function fillPresets() {
      const p = prog();
      const opts = PRESETS.filter(x => x[p]).map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('') + '<option value="custom">Custom (keep my text)</option>';
      g('if-preset').innerHTML = opts;
      if (ST.kw[p] == null) ST.kw[p] = presetText(ST.preset[p], p) || '';
      g('if-preset').value = presetText(ST.preset[p], p) != null ? ST.preset[p] : 'custom';
      g('if-kw').value = ST.kw[p];
      g('if-kw').placeholder = PROGRAMS[p].hint;
      g('if-chkl').hidden = p !== 'gaussian';
    }
    function syncControls() {
      g('if-prog').value = ST.prog; g('if-job').value = ST.job; g('if-cores').value = ST.cores; g('if-mem').value = ST.mem; g('if-chk').checked = !!ST.chk;
      fillPresets();
    }

    let warnLines = [], token = 0;
    const opts = () => ({ kw: ST.kw[prog()] || '', job: ST.job, cores: ST.cores, mem: ST.mem, chk: ST.chk });
    const fname = m => `${m.file}.${PROGRAMS[prog()].ext}`;
    async function one(m) {
      const r = parseXYZ(await loadXYZ(m.file));
      if (r.error) return { error: r.error };
      const b = build(prog(), m.file, r, opts());
      return { text: b.text, notes: b.notes.concat(r.warn) , warn: r.warn };
    }
    async function refresh() {
      const my = ++token, m = mols[molSel ? +molSel.value : 0];
      const empty = !(ST.kw[prog()] || '').trim();
      g('if-dl').disabled = empty;
      g('if-dl').textContent = single ? `Download ${fname(m)}` : `Download ${mols.length.toLocaleString()} input files (.zip)`;
      let res;
      try { res = await one(m); } catch (e) { res = { error: 'could not load the geometry (' + e.message + ')' }; }
      if (my !== token) return;
      const w = [];
      if (empty) w.push('Add keywords (method and basis set) before downloading.');
      if (res.error) w.push(`${m.name}: ${res.error} - this molecule is skipped.`);
      else (res.notes || []).forEach(n => w.push(n));
      g('if-warn').hidden = !w.length;
      g('if-warn').innerHTML = w.map(esc).join('<br>');
      g('if-prev').textContent = res.error ? '' : res.text;
      g('if-copy').disabled = !!res.error;
    }

    g('if-prog').onchange = e => { ST.prog = e.target.value; save(); fillPresets(); refresh(); };
    g('if-preset').onchange = e => {
      const p = prog(), v = e.target.value;
      ST.preset[p] = v;
      if (v !== 'custom') { ST.kw[p] = presetText(v, p); g('if-kw').value = ST.kw[p]; }
      save(); refresh();
    };
    g('if-kw').oninput = e => {
      const p = prog();
      ST.kw[p] = e.target.value;
      const pt = presetText(ST.preset[p], p);
      if (pt == null || e.target.value !== pt) { ST.preset[p] = 'custom'; g('if-preset').value = 'custom'; }
      save(); refresh();
    };
    g('if-job').onchange = e => { ST.job = e.target.value; save(); refresh(); };
    g('if-cores').oninput = e => { ST.cores = Math.max(1, parseInt(e.target.value, 10) || 1); save(); refresh(); };
    g('if-mem').oninput = e => { ST.mem = Math.max(0, parseFloat(e.target.value) || 0); save(); refresh(); };
    g('if-chk').onchange = e => { ST.chk = e.target.checked; save(); refresh(); };
    if (molSel) molSel.onchange = refresh;
    g('if-copy').onclick = async e => {
      try { await navigator.clipboard.writeText(g('if-prev').textContent); e.target.textContent = 'Copied'; }
      catch (err) { const r = document.createRange(); r.selectNodeContents(g('if-prev')); getSelection().removeAllRanges(); getSelection().addRange(r); e.target.textContent = 'Selected: press Ctrl/Cmd-C'; }
      setTimeout(() => { e.target.textContent = 'Copy preview'; }, 2000);
    };

    g('if-dl').onclick = async e => {
      const btn = e.currentTarget, label = btn.textContent;
      btn.disabled = true;
      try {
        if (single) {
          const r = await one(mols[0]);
          if (r.error) { alert(`${mols[0].name}: ${r.error}`); }
          else download(fname(mols[0]), new Blob([r.text], { type: 'text/plain' }));
        } else {
          const p = prog(), zip = new JSZip(), dir = zip.folder(`${cfg.zipName || 'structures'}_${PROGRAMS[p].name.replace('-', '').toLowerCase()}`);
          const issues = [], seen = new Set(), list = mols.filter(m => !seen.has(m.file) && seen.add(m.file));
          let done = 0, written = 0;
          for (let i = 0; i < list.length; i += 16) {
            await Promise.all(list.slice(i, i + 16).map(async m => {
              try {
                const r = await one(m);
                if (r.error) issues.push(`SKIPPED ${m.file}: ${r.error}`);
                else { dir.file(fname(m), r.text); written++; r.warn.forEach(w => issues.push(`WARNING ${m.file}: ${w}`)); }
              } catch (err) { issues.push(`SKIPPED ${m.file}: could not load the geometry (${err.message})`); }
              btn.textContent = `Preparing… ${++done}/${list.length}`;
            }));
          }
          dir.file('CITATION.txt', (cfg.cite || '') + `\nInput files for ${PROGRAMS[p].name} generated at the ACCDB/ASCDB web interface; charge and multiplicity come from the structure files.\n`);
          if (issues.length) dir.file('WARNINGS.txt', issues.sort().join('\n') + '\n');
          if (!written) throw new Error('no input file could be written');
          download(`${cfg.zipName || 'structures'}_${PROGRAMS[p].name.replace('-', '').toLowerCase()}.zip`, await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }));
          if (issues.length) alert(`${issues.length} issue(s) were found; they are listed in WARNINGS.txt inside the archive.`);
        }
      } catch (err) { alert('Could not build the input files: ' + err.message); }
      btn.textContent = label; btn.disabled = !(ST.kw[prog()] || '').trim();
    };

    syncControls();
    refresh();
  }

  function close() {
    if (!modal) return;
    modal.remove(); modal = null;
    document.body.classList.remove('modal-open');
    if (onKey) document.removeEventListener('keydown', onKey, true);
  }

  return { open, close, parseXYZ, build, PRESETS };
})();
