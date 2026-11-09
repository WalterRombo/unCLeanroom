(function (root) {
'use strict';

/* ---------- configuration ---------- */
const ORG = {
  S:    ['Staphylococcus',            '#f08a24'],
  M:    ['Micrococcus',               '#2b7bd6'],
  B:    ['Bacillus',                  '#1fa64a'],
  St:   ['Streptomyces',              '#8b5a2b'],
  UGNR: ['Gram-negative rods',        '#9b30b8'],
  UGPR: ['Gram-positive rods',        '#f2c100'],
  UGNC: ['Gram-negative coccobacilli','#e8508f'],
  Y:    ['Yeast',                     '#14a8a0'],
  Mo:   ['Mould',                     '#3c4a63'],
  UNID: ['Unidentified / awaiting ID','#9aa0a6']
};
const ORG_KEYS = Object.keys(ORG);
const TESTS = { AS: 'Air Sample', SP: 'Settle Plate', CP: 'Contact Plate' };
// Objectionable organisms: plotted whenever count > 0, even without a limit breach
const OBJ = ['B', 'UGNR', 'Mo', 'Y'];
const SHAPE = { AS: 'circle', SP: 'square', CP: 'triangle' };

// Grid line positions (px) on assets/floorplan.png: columns 1-7 and rows A-G
const GX = [126.5, 246.5, 366.5, 496.5, 636, 756.5, 866.5, 986.5];
const GY = [111.5, 251.5, 401.5, 551.5, 681.5, 811.5, 921.5, 1080.5];
const PLAN_W = 1060, PLAN_H = 1159, HEAD = 78, FOOT = 245;

// Equipment positions on the plan: [grid cell, text found in location name, x, y]
const ANCHORS = [
 ['A3','isolator',440,159],['A4','bioreactor',630,174],['A4','lectern',522,241],['A5','incubator',720,156],
 ['A6','76-02',832,211],['A6','76-03',832,162],['B1','ladder',158,393],['B4','trolley 9',498,318],
 ['B4','trolley 8',498,357],['B4','floor scales',583,359],['B5','trolley 7',675,277],['B6','trolley 4',803,307],
 ['C3','minus 80',462,497],['C4','tff',578,423],['C4','nc200',602,497],['C4','ph meter',602,497],
 ['C4','floor scales',528,460],['C5','akta',712,497],['C7','table',956,547],['C7','trolley 1',940,447],
 ['C7','trolley 2',942,407],['D1','trolley 10',160,590],['D3','76-01',392,572],['D3','lectern',462,661],
 ['D4','sartocheck',574,577],['D4','table',493,577],['D4','trolley 6',592,661],['D5','tff',667,572],
 ['D5','trolley 5',672,661],['E1','trolley 11',160,735],['E4','isolator',487,782],['E6','trolley 3',803,782],
 ['E7','trolley 3',803,782],['G1','trolley 12',165,1015],['G7','table',927,1052]
].map(a => ({ cell: a[0], re: new RegExp('(^|[^a-z0-9])' + a[1] + '([^a-z0-9]|$)'), x: a[2], y: a[3] }));

/* ---------- helpers ---------- */
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOC = new Map();
(root.LOCATIONS || []).forEach(l => LOC.set(norm(l[0]), { grid: l[1], equip: l[2], agar: l[3], test: l[4], grade: l[5] }));

function parseCSV(t) {
  t = t.replace(/^\uFEFF/, '');
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; }
    else f += c;
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  return rows.filter(x => x.some(v => v.trim() !== ''));
}

function testKey(name, csvType) {
  const l = LOC.get(norm(name));
  const s = norm(l ? l.test : name + ' ' + (csvType || ''));
  return /air/.test(s) ? 'AS' : /settle/.test(s) ? 'SP' : 'CP';
}

function parseGrowth(raw) {
  const out = [];
  String(raw || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean).forEach(tok => {
    const k = ORG_KEYS.find(k => k.toLowerCase() === tok.toLowerCase() && k !== 'UNID');
    const code = k || 'UNID';
    if (!out.includes(code)) out.push(code);
  });
  return out.length ? out : ['UNID'];
}

/* ---------- analysis ---------- */
function analyse(text) {
  const rows = parseCSV(text);
  if (rows.length < 2 || rows[0].length < 15) throw new Error('This does not look like a results CSV (expected at least 15 columns with a header row).');
  const H = rows[0].map(norm);
  const col = (name, dflt) => { const i = H.indexOf(name); return i < 0 ? dflt : i; };
  const C = { loc: col('plate location', 1), type: col('plate type', 2), grade: col('plate grade', 12), nr: col('result no record', 7),
    date: col('result date', 9), cnt: col('result count', 6), al: col('plate alert level', 13), ac: col('plate action level', 14), gr: col('growth', 18) };

  const R = { items: [], analysed: 0, noRecord: 0, unmatched: [], unplaced: [], dates: new Set(),
    byTest: {}, byGrade: {}, byOrg: {}, alert: 0, action: 0, obj: 0, objAll: 0, locations: new Set(), objLocations: new Set() };
  Object.keys(TESTS).forEach(k => R.byTest[k] = { n: 0, alert: 0, action: 0, obj: 0 });

  rows.slice(1).forEach(r => {
    const name = (r[C.loc] || '').trim();
    if (!name) return;
    if (/^true$/i.test((r[C.nr] || '').trim())) { R.noRecord++; return; }
    const count = parseFloat(r[C.cnt]);
    if (isNaN(count)) { R.noRecord++; return; }
    R.analysed++;
    if (r[C.date]) R.dates.add(r[C.date].trim());
    const alert = parseFloat(r[C.al]), action = parseFloat(r[C.ac]);
    const brk = (!isNaN(action) && count >= action) ? 'action' : (!isNaN(alert) && count >= alert) ? 'alert' : null;
    const allOrgs = parseGrowth(r[C.gr]);
    const objHit = count > 0 && allOrgs.some(o => OBJ.includes(o));
    const level = brk || (objHit ? 'obj' : null);
    const test = testKey(name, r[C.type]);
    const grade = (r[C.grade] || '').trim() || (LOC.get(norm(name)) || {}).grade || 'Unknown';
    R.byTest[test].n++;
    const g = R.byGrade[grade] || (R.byGrade[grade] = { n: 0, alert: 0, action: 0, obj: 0 });
    g.n++;
    if (!level) return;

    const known = LOC.get(norm(name));
    const m = name.match(/^([A-G])([1-7])(?=\s|$)/i);
    const item = { name, test, count, alert, action, level, grade, obj: objHit, orgs: level === 'obj' ? allOrgs.filter(o => OBJ.includes(o)) : allOrgs, matched: !!known };
    R[level]++; R.byTest[test][level]++; g[level]++;
    if (level !== 'obj') R.locations.add(name);
    if (objHit) { R.objAll++; R.objLocations.add(name); }
    item.orgs.forEach(o => { const t = R.byOrg[o] || (R.byOrg[o] = { n: 0, alert: 0, action: 0, obj: 0 }); t.n++; t[level]++; });
    if (!known) R.unmatched.push(name);
    if (!m) { R.unplaced.push(name); R.items.push(item); return; }
    const cell = m[1].toUpperCase() + m[2], ci = +m[2] - 1, ri = 'ABCDEFG'.indexOf(m[1].toUpperCase());
    const eq = norm(name.replace(/^[A-G]\d\s+/i, '').replace(/\s+(TSA|SDA)\s+(air sample|settle plate|contact plate)\s*$/i, ''));
    const anc = ANCHORS.find(a => a.cell === cell && a.re.test(eq));
    item.bx = anc ? anc.x : (GX[ci] + GX[ci + 1]) / 2;
    item.by = anc ? anc.y : (GY[ri] + GY[ri + 1]) / 2;
    item.r = level === 'action' ? 15 : level === 'alert' ? 11 : 11;
    item.lr = item.r + (objHit ? 8 : 0); // layout radius includes the objectionable halo
    R.items.push(item);
  });
  R.dates = [...R.dates];
  return R;
}

/* ---------- marker layout (nudge overlapping markers apart) ---------- */
function layout(items) {
  const placed = [];
  items.filter(i => i.bx !== undefined).sort((a, b) => b.lr - a.lr).forEach(it => {
    let pos = null;
    for (let ring = 0; ring < 14 && !pos; ring++) {
      const n = ring ? ring * 8 : 1;
      for (let k = 0; k < n && !pos; k++) {
        const a = 2 * Math.PI * k / n, x = it.bx + Math.cos(a) * ring * 9, y = it.by + Math.sin(a) * ring * 9;
        if (x < 10 || y < 10 || x > PLAN_W - 10 || y > PLAN_H - 10) continue;
        if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.lr + it.lr + 3)) pos = { x, y };
      }
    }
    it.x = pos ? pos.x : it.bx; it.y = pos ? pos.y : it.by;
    placed.push(it);
  });
}

/* ---------- drawing ---------- */
function mix(hex, t) { // blend colour with white
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t));
  return 'rgb(' + c.join(',') + ')';
}
function path(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, 2 * Math.PI);
  else if (shape === 'square') ctx.rect(x - r * .88, y - r * .88, r * 1.76, r * 1.76);
  else { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.1, y + r * .85); ctx.lineTo(x - r * 1.1, y + r * .85); ctx.closePath(); }
}
function marker(ctx, shape, x, y, r, orgs, level, obj) {
  const bold = level === 'action', pale = level === 'obj', n = orgs.length;
  if (obj) { // objectionable organism: dashed dark halo ring
    ctx.save(); ctx.setLineDash([3.5, 3]); ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * 1.15 + 6, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
  }
  ctx.save(); path(ctx, shape, x, y, r); ctx.clip();
  orgs.forEach((o, i) => {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.arc(x, y, r * 1.6, -Math.PI / 2 + 2 * Math.PI * i / n, -Math.PI / 2 + 2 * Math.PI * (i + 1) / n); ctx.closePath();
    ctx.fillStyle = bold ? ORG[o][1] : mix(ORG[o][1], pale ? .5 : .58); ctx.fill();
  });
  if (n > 1) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    orgs.forEach((o, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6); ctx.stroke(); });
  }
  ctx.restore();
  path(ctx, shape, x, y, r);
  ctx.lineWidth = bold ? 2.6 : 1.6;
  ctx.strokeStyle = bold ? '#111' : pale ? '#444' : (n === 1 ? ORG[orgs[0]][1] : '#6b7a84');
  if (pale) ctx.setLineDash([3, 2.5]);
  ctx.stroke(); ctx.setLineDash([]);
}

function render(canvas, R, plan) {
  const ctx = canvas.getContext('2d');
  canvas.width = PLAN_W; canvas.height = HEAD + PLAN_H + FOOT;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const F = 'Bricolage Grotesque, system-ui, Segoe UI, Arial, sans-serif';
  // header
  ctx.fillStyle = '#12222b'; ctx.textBaseline = 'alphabetic';
  ctx.font = '800 28px ' + F; ctx.fillText('(un)Cleanroom? \u2013 environmental monitoring heat map', 20, 34);
  ctx.font = '500 17px ' + F; ctx.fillStyle = '#444';
  ctx.fillText((R.dates.length ? 'Sampling date: ' + R.dates.join(', ') + '   |   ' : '') + 'Alert: ' + R.alert + '   Action: ' + R.action +
    '   Locations in excursion: ' + R.locations.size + '   Objectionable organisms: ' + R.objAll + '   Plates analysed: ' + R.analysed, 20, 64);
  ctx.drawImage(plan, 0, HEAD, PLAN_W, PLAN_H);
  // markers
  ctx.save(); ctx.translate(0, HEAD);
  layout(R.items);
  R.items.filter(i => i.x !== undefined).sort((a, b) => ({ obj: 0, alert: 1, action: 2 }[a.level] - { obj: 0, alert: 1, action: 2 }[b.level]))
    .forEach(i => marker(ctx, SHAPE[i.test], i.x, i.y, i.r, i.orgs, i.level, i.obj));
  ctx.restore();
  if (!R.items.length) {
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(PLAN_W / 2 - 250, HEAD + 40, 500, 44);
    ctx.fillStyle = '#12222b'; ctx.font = '700 20px ' + F; ctx.textAlign = 'center';
    ctx.fillText('No excursions or objectionable organisms', PLAN_W / 2, HEAD + 69); ctx.textAlign = 'left';
  }
  // legend
  let y = HEAD + PLAN_H + 14;
  ctx.fillStyle = '#f2f5f6'; ctx.fillRect(0, y - 14, PLAN_W, FOOT); ctx.font = '600 15px ' + F;
  ctx.fillStyle = '#12222b'; ctx.fillText('Sample type', 20, y + 18);
  Object.keys(TESTS).forEach((k, i) => { const x = 140 + i * 190; marker(ctx, SHAPE[k], x, y + 13, 11, ['UNID'], 'alert'); ctx.fillStyle = '#12222b'; ctx.fillText(TESTS[k], x + 22, y + 18); });
  y += 44; ctx.fillText('Limit breached', 20, y + 18);
  marker(ctx, 'circle', 150, y + 13, 11, ['B'], 'alert'); ctx.fillStyle = '#12222b'; ctx.fillText('Alert level (light, outlined in organism colour)', 172, y + 18);
  marker(ctx, 'circle', 560, y + 13, 14, ['B'], 'action'); ctx.fillStyle = '#12222b'; ctx.fillText('Action level (bold, black outline)', 584, y + 18);
  y += 44; ctx.fillStyle = '#12222b'; ctx.fillText('Objectionable', 20, y + 18);
  marker(ctx, 'circle', 150, y + 13, 11, ['B'], 'obj', true); ctx.fillStyle = '#12222b'; ctx.fillText('Objectionable organism (B, UGNR, Y, Mo), count > 0, no limit breach', 178, y + 18);
  y += 36; ctx.fillStyle = '#555'; ctx.font = '400 14px ' + F;
  ctx.fillText('A dashed ring around any marker means an objectionable organism is present on that plate.', 150, y + 14);
  ctx.font = '600 15px ' + F;
  y += 30; ctx.fillStyle = '#12222b'; ctx.fillText('Growth', 20, y + 18);
  const found = ORG_KEYS.filter(k => R.byOrg[k]); let x = 100, yy = y;
  (found.length ? found : ORG_KEYS.filter(k => k !== 'UNID')).forEach(k => {
    const label = ORG[k][0] + (k === 'UNID' ? '' : ' (' + k + ')');
    const w = ctx.measureText(label).width + 40;
    if (x + w > PLAN_W - 10) { x = 100; yy += 28; }
    ctx.fillStyle = ORG[k][1]; ctx.beginPath(); ctx.arc(x + 8, yy + 13, 8, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#12222b'; ctx.fillText(label, x + 22, yy + 18); x += w + 8;
  });
  ctx.font = '400 12px ' + F; ctx.fillStyle = '#666';
  ctx.fillText('Markers with several organisms are split into equal segments. Breach = count \u2265 limit. Generated by (un)Cleanroom?', 20, HEAD + PLAN_H + FOOT - 6);
}

/* ---------- results tables ---------- */
const tbl = (title, head, rows, cls) => '<div class="tbl ' + (cls || '') + '"><h3>' + title + '</h3><table><thead><tr>' +
  head.map((h, i) => '<th' + (i && h.n ? ' class="n"' : '') + '>' + (h.t || h) + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map(r => '<tr>' + r.map((c, i) => '<td' + (head[i].n ? ' class="n"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';

function showResults(R) {
  const $ = id => document.getElementById(id);
  $('resMeta').textContent = (R.dates.length ? R.dates.join(', ') + ' \u2013 ' : '') + R.analysed + ' plates analysed' + (R.noRecord ? ', ' + R.noRecord + ' with no result recorded' : '');
  $('stats').innerHTML = [['alert', R.alert, 'Alert level violations'], ['action', R.action, 'Action level violations'],
    ['total', R.alert + R.action, 'Plates in excursion'], ['total', R.locations.size, 'Locations in excursion'], ['obj', R.objAll, 'Plates with objectionable organisms']]
    .map(s => '<div class="stat ' + s[0] + '"><b>' + s[1] + '</b><span>' + s[2] + '</span></div>').join('');

  let notes = '';
  if (R.unmatched.length) notes += '<div class="note"><b>' + R.unmatched.length + ' plate name(s) not found in the 2026 location list</b> \u2013 placed using the grid reference instead: ' + esc([...new Set(R.unmatched)].join('; ')) + '</div>';
  if (R.unplaced.length) notes += '<div class="note"><b>Could not be placed on the map</b> (no grid reference): ' + esc([...new Set(R.unplaced)].join('; ')) + '</div>';
  $('notices').innerHTML = notes;

  const dot = k => '<span class="sw" style="background:' + ORG[k][1] + '"></span>';
  const found = ORG_KEYS.filter(k => R.byOrg[k]);
  const T = [];
  T.push(tbl('Growth found in this round', ['Organism', 'Code', { t: 'Plates', n: 1 }, { t: 'Alert', n: 1 }, { t: 'Action', n: 1 }, { t: 'Objectionable only', n: 1 }],
    found.length ? found.map(k => [dot(k) + ORG[k][0] + (OBJ.includes(k) ? ' *' : ''), k === 'UNID' ? '\u2013' : k, R.byOrg[k].n, R.byOrg[k].alert, R.byOrg[k].action, R.byOrg[k].obj]) : [['None', '', '', '', '', '']]));
  T.push(tbl('By sample type', ['Type', { t: 'Analysed', n: 1 }, { t: 'Alert', n: 1 }, { t: 'Action', n: 1 }, { t: 'Objectionable only', n: 1 }],
    Object.keys(TESTS).map(k => [TESTS[k], R.byTest[k].n, R.byTest[k].alert, R.byTest[k].action, R.byTest[k].obj])));
  T.push(tbl('By grade', ['Grade', { t: 'Analysed', n: 1 }, { t: 'Alert', n: 1 }, { t: 'Action', n: 1 }, { t: 'Objectionable only', n: 1 }],
    Object.keys(R.byGrade).sort().map(g => [esc(g), R.byGrade[g].n, R.byGrade[g].alert, R.byGrade[g].action, R.byGrade[g].obj])));
  const rank = { action: 2, alert: 1, obj: 0 };
  const ex = R.items.slice().sort((a, b) => rank[b.level] - rank[a.level] || b.count - a.count);
  T.push(tbl('Plates on the map (excursions and objectionable organisms)', ['Plate location', { t: 'Count', n: 1 }, { t: 'Alert', n: 1 }, { t: 'Action', n: 1 }, 'Level', 'Growth'],
    ex.length ? ex.map(i => [esc(i.name), i.count, i.alert, i.action, '<span class="lvl-' + i.level + '">' + (i.level === 'obj' ? 'Objectionable' : i.level[0].toUpperCase() + i.level.slice(1)) + (i.obj && i.level !== 'obj' ? ' + objectionable' : '') + '</span>',
      i.orgs.map(o => o === 'UNID' ? 'Unidentified' : o).join(', ')]) : [['Nothing to plot', '', '', '', '', '']], 'wide'));
  $('tables').innerHTML = T.join('') + '<p class="fine" style="grid-column:1/-1">* Objectionable organism (B, UGNR, Y, Mo): plotted whenever the plate count is above 0, whether or not a limit is breached. "Objectionable only" = plates with no alert or action breach.</p>';
}

/* ---------- UI wiring ---------- */
function init() {
  const $ = id => document.getElementById(id);
  let text = null, fname = '', last = null;
  const plan = new Image(); plan.src = root.FLOORPLAN;
  const planReady = new Promise(res => { plan.onload = res; });

  function setFile(f) {
    $('err').hidden = true;
    if (!f) return;
    const rd = new FileReader();
    rd.onerror = () => { $('err').textContent = 'Could not read that file. Please try again.'; $('err').hidden = false; };
    rd.onload = () => { text = rd.result; fname = f.name; $('dishText').innerHTML = esc(f.name) + '<br><small>Ready \u2013 click Analysis</small>'; $('go').disabled = false; };
    rd.readAsText(f);
  }
  $('file').addEventListener('change', e => { setFile(e.target.files[0]); });
  const dish = $('dish');
  // Accept a dropped file anywhere on the landing page and stop Chrome opening it in the tab
  window.addEventListener('dragover', e => { e.preventDefault(); if (!$('landing').hidden) dish.classList.add('over'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) dish.classList.remove('over'); });
  window.addEventListener('drop', e => {
    e.preventDefault(); dish.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && !$('landing').hidden) setFile(f);
  });
  dish.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });

  $('go').addEventListener('click', async () => {
    try {
      last = analyse(text);
      await planReady;
      $('landing').hidden = true; $('results').hidden = false;
      showResults(last); render($('map'), last, plan); window.scrollTo(0, 0);
    } catch (e) { $('err').textContent = e.message; $('err').hidden = false; }
  });
  $('again').addEventListener('click', () => {
    $('results').hidden = true; $('landing').hidden = false; text = null; $('file').value = '';
    $('go').disabled = true; $('dishText').innerHTML = 'Drag a CSV here<br><small>or click to browse</small>';
  });
  const fileBase = () => 'uncleanroom_heatmap_' + ((last && last.dates[0]) || 'results').replace(/[^0-9A-Za-z]+/g, '-');
  const save = (type, ext) => {
    const a = document.createElement('a'); a.href = $('map').toDataURL(type, .93); a.download = fileBase() + '.' + ext; a.click();
  };
  $('dlPng').addEventListener('click', () => save('image/png', 'png'));
  $('dlJpg').addEventListener('click', () => save('image/jpeg', 'jpg'));
}

root.UC = { analyse, parseCSV, layout, render, ORG };
if (typeof document !== 'undefined') init();
})(typeof window !== 'undefined' ? window : globalThis);
