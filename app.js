const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FREE_CARDS = 8;
const MAX_CARDS = 500;
const STORE_BILLING = 'https://store.microsoft.com/billing';
const PRO_SKU = 'bingopress_pro';
const PRO_IDS = [PRO_SKU];
let STORE_URL = 'https://apps.microsoft.com/detail/9P52VVM0T97J';
let proAvailable = false; // Pro limits apply only when the Store actually sells the add-on
let proSku = PRO_SKU;
let isPro = false;
try { isPro = localStorage.getItem('bingopress-pro') === '1'; } catch (_) {}
const unlocked = () => isPro || !proAvailable;

async function billing() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(STORE_BILLING); } catch (_) { return null; }
}
function setPro(v) {
  isPro = v;
  try { localStorage.setItem('bingopress-pro', v ? '1' : '0'); } catch (_) {}
  const b = $('proBtn');
  b.textContent = v ? '★ Pro' : '★ Get Pro';
  b.classList.toggle('is-pro', v);
  b.hidden = !proAvailable && !v;
  document.body.classList.toggle('unlocked', unlocked());
  if (typeof renderAll === 'function') renderAll();
}
async function checkPro() {
  const svc = await billing();
  if (!svc) return false;
  try {
    const details = await svc.getDetails(PRO_IDS).catch(() => []);
    proAvailable = details.length > 0;
    if (details[0]) { proSku = details[0].itemId; if (!PRO_IDS.includes(proSku)) PRO_IDS.push(proSku); }
    const list = await svc.listPurchases();
    const owned = list.some((p) => PRO_IDS.includes(p.itemId));
    setPro(owned);
    return owned;
  } catch (_) { return isPro; }
}
function proMessage(text) { const m = $('proMsg'); m.hidden = !text; m.textContent = text || ''; }
async function openPro(reason) {
  proMessage(reason || '');
  const svc = await billing();
  if (!svc) {
    $('buyBtn').textContent = 'Get BingoPress on Microsoft Store';
    $('restoreBtn').hidden = true;
  } else {
    $('restoreBtn').hidden = false;
    try {
      const [d] = await svc.getDetails([proSku]);
      const price = d && d.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) : '';
      $('buyBtn').textContent = price ? `Unlock Pro – ${price}` : 'Unlock Pro';
    } catch (_) { $('buyBtn').textContent = 'Unlock Pro'; }
  }
  if (!$('proDialog').open) $('proDialog').showModal();
}
async function buyPro() {
  const svc = await billing();
  if (!svc) { window.open(STORE_URL, '_blank'); return; }
  const methods = [{ supportedMethods: STORE_BILLING, data: { sku: proSku } }];
  try {
    let req;
    try { req = new PaymentRequest(methods); }
    catch (_) { req = new PaymentRequest(methods, { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }); }
    const res = await req.show();
    await res.complete('success');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    proMessage('Purchase could not be completed: ' + (e.message || e));
    return;
  }
  if (await checkPro()) { proMessage('Thank you! Pro is unlocked. ★'); setTimeout(() => $('proDialog').close(), 1500); }
}
function needsPro(reason) {
  if (unlocked()) return false;
  openPro(reason);
  return true;
}

// ---------- options ----------
const PAPERS = { letter: { name: 'US Letter', w: 215.9, h: 279.4 }, a4: { name: 'A4', w: 210, h: 297 } };
const THEMES = { blue: { name: 'Blue', c: '#1d4ed8', l: '#dbeafe' }, red: { name: 'Red', c: '#dc2626', l: '#fee2e2' }, green: { name: 'Green', c: '#15803d', l: '#dcfce7' }, purple: { name: 'Purple', c: '#7c3aed', l: '#ede9fe' }, orange: { name: 'Orange', c: '#ea580c', l: '#ffedd5' }, ink: { name: 'Black & white (saves ink)', c: '#111111', l: '#ffffff' } };
const TYPES = { b75: '75-ball (US)', word: 'Word bingo', b90: '90-ball (UK)' };
const LETTERS = 'BINGO';
const FONT = '"Segoe UI", Arial, sans-serif';
const uid = () => Math.random().toString(36).slice(2, 10);
const newSeed = () => 1000 + Math.floor(Math.random() * 9000);

// ---------- state ----------
let st = { type: 'b75', count: 8, per: 4, paper: 'letter', title: 'BINGO NIGHT', theme: 'blue', seed: newSeed(), grid: 5, words: '', slips: false, checklist: false, speak: true, view: 'cards', calls: { b75: [], b90: [], word: [] } };
try { const saved = JSON.parse(localStorage.getItem('bingopress') || '{}'); Object.assign(st, saved); st.calls = Object.assign({ b75: [], b90: [], word: [] }, saved.calls || {}); } catch (_) {}
if (!TYPES[st.type]) st.type = 'b75';
if (!THEMES[st.theme]) st.theme = 'blue';
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('bingopress', JSON.stringify(st)); } catch (_) { if (typeof toast === 'function') toast('Could not save'); } }, 250); }

// ---------- random numbers that can be repeated from a seed ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(list, n, rnd) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- words ----------
function wordList(text) {
  let raw = String(text == null ? st.words : text);
  let parts = raw.split(/\r?\n/);
  if (parts.filter((x) => x.trim()).length === 1 && raw.includes(',')) parts = raw.split(',');
  const seen = new Set(), out = [];
  for (const p of parts) { const w = p.trim().replace(/\s+/g, ' ').slice(0, 40); const k = w.toLowerCase(); if (w && !seen.has(k)) { seen.add(k); out.push(w); } }
  return out;
}
const gridSize = () => (st.type === 'b75' ? 5 : Math.max(3, Math.min(5, st.grid | 0 || 5)));
const hasFree = () => gridSize() === 5 && st.type !== 'b90';
const wordsNeeded = () => { const k = gridSize(); return k * k - (k === 5 ? 1 : 0); };

// ---------- cards ----------
// A card: { no, cells: [...] } in reading order; the free centre is null. 90-ball: { no, rows: [[9 values or null] x3] }.
function card75(rnd) {
  const cols = [0, 1, 2, 3, 4].map((c) => pick(range(c * 15 + 1, c * 15 + 15), 5, rnd));
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push(r === 2 && c === 2 ? null : cols[c][r]);
  return { cells };
}
function cardWord(rnd, words) {
  const k = gridSize(), free = k === 5, n = k * k - (free ? 1 : 0);
  const chosen = pick(words, n, rnd), cells = [];
  let i = 0;
  for (let j = 0; j < k * k; j++) cells.push(free && j === 12 ? null : chosen[i++]);
  return { cells };
}
function card90(rnd) {
  // each row has 5 numbers, every column has at least one number
  let layout;
  for (let t = 0; t < 500; t++) {
    layout = [0, 1, 2].map(() => new Set(pick(range(0, 8), 5, rnd)));
    if (range(0, 8).every((c) => layout.some((r) => r.has(c)))) break;
  }
  const rows = [0, 1, 2].map(() => Array(9).fill(null));
  for (let c = 0; c < 9; c++) {
    const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9;
    const rs = [0, 1, 2].filter((r) => layout[r].has(c));
    const nums = pick(range(lo, hi), rs.length, rnd).sort((a, b) => a - b);
    rs.forEach((r, i) => { rows[r][c] = nums[i]; });
  }
  return { rows };
}
const sig = (cd) => JSON.stringify(cd.cells || cd.rows);
let cardCache = { key: '', list: [] };
function cardKey() { return [st.type, st.seed, st.type === 'word' ? gridSize() + '|' + wordList().join('\u0001') : ''].join('#'); }
function cards(n) {
  const key = cardKey();
  if (cardCache.key !== key) cardCache = { key, list: [], seen: new Set(), rnd: rng(st.seed * 7919 + (st.type === 'b90' ? 3 : st.type === 'word' ? 2 : 1)) };
  const c = cardCache, words = st.type === 'word' ? wordList() : null;
  if (st.type === 'word' && words.length < wordsNeeded()) return [];
  let tries = 0;
  while (c.list.length < n && tries < n * 50 + 200) {
    tries++;
    const cd = st.type === 'b75' ? card75(c.rnd) : st.type === 'b90' ? card90(c.rnd) : cardWord(c.rnd, words);
    const s = sig(cd);
    if (c.seen.has(s)) continue;
    c.seen.add(s); cd.no = c.list.length + 1; c.list.push(cd);
  }
  return c.list.slice(0, n);
}
const cardCount = () => Math.max(1, Math.min(MAX_CARDS, st.count | 0 || 1));
const fmtNo = (n) => String(n).padStart(3, '0');

// ---------- calling ----------
function pool() { return st.type === 'b75' ? range(1, 75) : st.type === 'b90' ? range(1, 90) : wordList(); }
const letterOf = (v) => LETTERS[Math.min(4, Math.floor((v - 1) / 15))];
const callLabel = (v) => (st.type === 'b75' && typeof v === 'number' ? `${letterOf(v)} ${v}` : String(v));
function spoken(v) {
  if (st.type === 'b75') return `${letterOf(v)}, ${v}`;
  if (st.type === 'b90') { const s = String(v); return s.length === 2 ? `${s[0]} ${s[1]}, ${v}` : `Number ${v}`; }
  return String(v);
}
const called = () => st.calls[st.type] || (st.calls[st.type] = []);
function callNext(rnd) {
  const done = new Set(called().map(String)), left = pool().filter((v) => !done.has(String(v)));
  if (!left.length) return null;
  const v = left[Math.floor((rnd || Math.random)() * left.length)];
  called().push(v);
  return v;
}

// ---------- checking a card ----------
function lines(k) {
  const L = [];
  for (let r = 0; r < k; r++) L.push({ name: `Row ${r + 1}`, cells: range(0, k - 1).map((c) => r * k + c) });
  for (let c = 0; c < k; c++) L.push({ name: `Column ${st.type === 'b75' ? LETTERS[c] : c + 1}`, cells: range(0, k - 1).map((r) => r * k + c) });
  L.push({ name: 'Diagonal', cells: range(0, k - 1).map((i) => i * k + i) });
  L.push({ name: 'Diagonal', cells: range(0, k - 1).map((i) => i * k + (k - 1 - i)) });
  return L;
}
function checkCard(no) {
  const n = Math.max(1, no | 0);
  const list = cards(n), cd = list[n - 1];
  if (!cd) return null;
  const done = new Set(called().map((v) => String(v).toLowerCase()));
  const hit = (v) => v === null || done.has(String(v).toLowerCase());
  const wins = [];
  if (cd.rows) {
    const marks = cd.rows.map((row) => row.map((v) => v !== null && hit(v)));
    const full = cd.rows.map((row, r) => row.every((v, c) => v === null || marks[r][c]));
    const n2 = full.filter(Boolean).length;
    if (n2 === 3) wins.push('Full house'); else if (n2 === 2) wins.push('Two lines'); else if (n2 === 1) wins.push('One line');
    const missing = [];
    cd.rows.forEach((row, r) => row.forEach((v, c) => { if (v !== null && !marks[r][c]) missing.push(v); }));
    return { card: cd, marks, wins, missing };
  }
  const k = Math.round(Math.sqrt(cd.cells.length));
  const marks = cd.cells.map(hit);
  for (const l of lines(k)) if (l.cells.every((i) => marks[i])) wins.push(l.name);
  if ([0, k - 1, k * (k - 1), k * k - 1].every((i) => marks[i])) wins.push('Four corners');
  if (marks.every(Boolean)) wins.push('Full card');
  const missing = cd.cells.filter((v, i) => !marks[i]);
  return { card: cd, marks, wins, missing };
}

// ---------- text helpers ----------
let mctx = null;
function textW(s, fs, weight) {
  if (typeof document !== 'undefined') { try { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); mctx.font = `${weight || 400} 100px ${FONT}`; return mctx.measureText(s).width * fs / 100; } catch (_) {} }
  return String(s).length * fs * (weight >= 600 ? 0.6 : 0.52);
}
const fit = (s, fs, maxW, wt) => { const w = textW(s, fs, wt); return w > maxW ? fs * maxW / w : fs; };
function wrap(s, fs, maxW, wt) { const out = []; let line = ''; for (const w of String(s || '').split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (line && textW(t, fs, wt) > maxW) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
const f2 = (n) => (+n).toFixed(2);
const T = (t, x, y, fs, extra, anchor) => (t === '' || t == null) ? '' : `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(fs)}"${anchor ? ` text-anchor="${anchor}"` : ''}${extra || ''}>${esc(t)}</text>`;
const svgPage = (w, h, s) => ({ w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" font-family='${FONT}' fill="#111"><rect width="${w}" height="${h}" fill="#fff"/>${s}</svg>` });

// fit a word or phrase into a box: up to 3 lines, as large as possible
function cellFs(word, w, h, maxFs) {
  let fs = maxFs;
  for (; fs > 2; fs *= 0.94) { const ls = wrap(word, fs, w * 0.86, 600); if (ls.length <= 3 && ls.every((l) => textW(l, fs, 600) <= w * 0.86) && ls.length * fs * 1.12 <= h * 0.84) break; }
  return fs;
}
function cellText(word, cx, cy, w, h, maxFs, fixedFs) {
  const fs = fixedFs || cellFs(word, w, h, maxFs);
  const ls = wrap(word, fs, w * 0.86, 600).slice(0, 3);
  const y0 = cy - (ls.length - 1) * fs * 1.12 / 2 + fs * 0.35;
  return ls.map((l, i) => T(l, cx, y0 + i * fs * 1.12, fs, ' font-weight="600"', 'middle')).join('');
}

// ---------- drawing one card ----------
function cardRatio() {
  if (st.type === 'b90') return null;
  const k = gridSize(), letters = st.type === 'b75' || k === 5;
  return (st.title ? 0.12 : 0) + (letters ? 1 / k : 0) + 1 + 0.075;
}
function drawCard(cd, x, y, w) {
  const th = THEMES[st.theme], k = Math.round(Math.sqrt(cd.cells.length)), cell = w / k, letters = st.type === 'b75' || k === 5;
  let s = '', yy = y;
  const wordFs = cd.cells.some((v) => typeof v === 'string') ? Math.min(...cd.cells.filter((v) => typeof v === 'string').map((v) => cellFs(v, cell, cell, cell * 0.24))) : 0;
  if (st.title) { const fs = fit(st.title, w * 0.075, w * 0.96, 700); s += T(st.title, x + w / 2, yy + w * 0.085, fs, ` font-weight="700" fill="${th.c === '#ffffff' ? '#111' : th.c}"`, 'middle'); yy += w * 0.12; }
  if (letters) {
    for (let c = 0; c < k; c++) {
      const ink = st.theme === 'ink';
      s += `<rect x="${f2(x + c * cell)}" y="${f2(yy)}" width="${f2(cell)}" height="${f2(cell)}" fill="${ink ? '#fff' : th.c}" stroke="${ink ? '#111' : th.c}" stroke-width=".5"/>`;
      s += T(LETTERS[c], x + c * cell + cell / 2, yy + cell * 0.72, cell * 0.66, ` font-weight="800" fill="${ink ? '#111' : '#fff'}"`, 'middle');
    }
    yy += cell;
  }
  for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) {
    const v = cd.cells[r * k + c], cx = x + c * cell, cy = yy + r * cell;
    s += `<rect x="${f2(cx)}" y="${f2(cy)}" width="${f2(cell)}" height="${f2(cell)}" fill="${v === null ? th.l : '#fff'}" stroke="#111" stroke-width=".45"/>`;
    if (v === null) {
      s += T('★', cx + cell / 2, cy + cell * 0.5, cell * 0.36, ` fill="${st.theme === 'ink' ? '#111' : th.c}"`, 'middle') + T('FREE', cx + cell / 2, cy + cell * 0.82, cell * 0.2, ` font-weight="800" fill="${st.theme === 'ink' ? '#111' : th.c}"`, 'middle');
    } else if (typeof v === 'number') s += T(String(v), cx + cell / 2, cy + cell * 0.66, cell * 0.46, ' font-weight="700"', 'middle');
    else s += cellText(v, cx + cell / 2, cy + cell / 2, cell, cell, cell * 0.24, Math.max(wordFs, cell * 0.12));
  }
  s += `<rect x="${f2(x)}" y="${f2(yy)}" width="${f2(w)}" height="${f2(k * cell)}" fill="none" stroke="#111" stroke-width="1"/>`;
  yy += k * cell;
  s += T(`Card ${fmtNo(cd.no)}`, x + w, yy + w * 0.052, w * 0.035, ' fill="#333" font-weight="600"', 'end');
  s += T(`Set ${st.seed}`, x, yy + w * 0.052, w * 0.03, ' fill="#777"');
  return s;
}
function drawTicket(cd, x, y, w, cellH) {
  const th = THEMES[st.theme], cw = w / 9, head = 6;
  let s = '';
  s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${head}" fill="${st.theme === 'ink' ? '#fff' : th.c}"/>`;
  s += T(st.title || 'BINGO', x + 2, y + 4.4, 3.8, ` font-weight="700" fill="${st.theme === 'ink' ? '#111' : '#fff'}"`);
  s += T(`Ticket ${fmtNo(cd.no)} · Set ${st.seed}`, x + w - 2, y + 4.4, 3.2, ` font-weight="600" fill="${st.theme === 'ink' ? '#111' : '#fff'}"`, 'end');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
    const v = cd.rows[r][c], cx = x + c * cw, cy = y + head + r * cellH;
    s += `<rect x="${f2(cx)}" y="${f2(cy)}" width="${f2(cw)}" height="${f2(cellH)}" fill="${v === null ? th.l : '#fff'}" stroke="#111" stroke-width=".4"/>`;
    if (v !== null) s += T(String(v), cx + cw / 2, cy + cellH * 0.7, Math.min(cellH * 0.6, cw * 0.5), ' font-weight="700"', 'middle');
  }
  s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(head + 3 * cellH)}" fill="none" stroke="#111" stroke-width=".9"/>`;
  return s;
}

// ---------- pages ----------
function cardPages(screen) {
  const P = PAPERS[st.paper] || PAPERS.letter, W = P.w, H = P.h, m = 10, g = 8;
  const n = screen ? Math.min(cardCount(), 8) : cardCount();
  const list = cards(n), pages = [];
  if (!list.length) {
    const need = wordsNeeded(), have = wordList().length;
    return [svgPage(W, H, T('Type your words on the left.', W / 2, H / 2 - 8, 7, ' font-weight="700" fill="#555"', 'middle') + T(`A ${gridSize()}×${gridSize()} card needs at least ${need} different words – you have ${have}.`, W / 2, H / 2 + 4, 4.6, ' fill="#777"', 'middle'))];
  }
  if (st.type === 'b90') {
    const per = 6, cellH = Math.min(14, ((H - 2 * m - (per - 1) * 4) / per - 6) / 3), w = W - 2 * m, th = 6 + 3 * cellH;
    for (let i = 0; i < list.length; i += per) {
      let s = '';
      list.slice(i, i + per).forEach((cd, j) => { const y = m + j * (th + 4); s += drawTicket(cd, m, y, w, cellH); if (j) s += `<line x1="0" x2="${W}" y1="${f2(y - 2)}" y2="${f2(y - 2)}" stroke="#bbb" stroke-width=".25" stroke-dasharray="2 2"/>`; });
      pages.push(svgPage(W, H, s));
    }
    return pages;
  }
  const per = [1, 2, 4].includes(st.per) ? st.per : 4, cols = per === 4 ? 2 : 1, rows = per === 1 ? 1 : 2, r = cardRatio();
  const w = Math.min((W - 2 * m - (cols - 1) * g) / cols, ((H - 2 * m - (rows - 1) * g) / rows) / r), h = w * r;
  const gx = (W - cols * w) / (cols + 1), gy = (H - rows * h) / (rows + 1);
  for (let i = 0; i < list.length; i += per) {
    let s = '';
    list.slice(i, i + per).forEach((cd, j) => { const c = j % cols, rr = Math.floor(j / cols); s += drawCard(cd, gx + c * (w + gx), gy + rr * (h + gy), w); });
    if (cols === 2) s += `<line x1="${f2(W / 2)}" x2="${f2(W / 2)}" y1="0" y2="${H}" stroke="#bbb" stroke-width=".25" stroke-dasharray="2 2"/>`;
    if (rows === 2) s += `<line x1="0" x2="${W}" y1="${f2(H / 2)}" y2="${f2(H / 2)}" stroke="#bbb" stroke-width=".25" stroke-dasharray="2 2"/>`;
    pages.push(svgPage(W, H, s));
  }
  return pages;
}
function slipPages() {
  const P = PAPERS[st.paper] || PAPERS.letter, W = P.w, H = P.h, m = 10, th = THEMES[st.theme];
  const items = pool(), words = st.type === 'word', cols = words ? 4 : st.type === 'b90' ? 6 : 5, rows = 15;
  if (!items.length) return [];
  const sw = (W - 2 * m) / cols, sh = (H - 2 * m - 8) / rows, per = cols * rows, pages = [];
  for (let i = 0; i < items.length; i += per) {
    let s = T('Calling slips – cut out, fold and draw from a bowl', W / 2, m + 4, 4, ' fill="#555"', 'middle');
    items.slice(i, i + per).forEach((v, j) => {
      const x = m + (j % cols) * sw, y = m + 8 + Math.floor(j / cols) * sh;
      s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(sw)}" height="${f2(sh)}" fill="none" stroke="#999" stroke-width=".25" stroke-dasharray="1.5 1.5"/>`;
      if (st.type === 'b75') s += T(letterOf(v), x + sw * 0.28, y + sh * 0.68, sh * 0.55, ` font-weight="800" fill="${st.theme === 'ink' ? '#111' : th.c}"`, 'middle') + T(String(v), x + sw * 0.64, y + sh * 0.7, sh * 0.6, ' font-weight="700"', 'middle');
      else if (words) s += cellText(v, x + sw / 2, y + sh / 2, sw, sh, sh * 0.4);
      else s += T(String(v), x + sw / 2, y + sh * 0.7, sh * 0.6, ' font-weight="700"', 'middle');
    });
    pages.push(svgPage(W, H, s));
  }
  return pages;
}
function checklistPages() {
  const P = PAPERS[st.paper] || PAPERS.letter, W = P.w, H = P.h, m = 12, th = THEMES[st.theme], items = pool();
  if (!items.length) return [];
  const head = (y, t) => T(t, m, y, 6, ' font-weight="700"') + T('Cross off each number as it is called.', W - m, y, 3.4, ' fill="#666"', 'end');
  if (st.type === 'word') {
    const cols = 3, rowH = 9, cw = (W - 2 * m) / cols, perCol = Math.floor((H - 2 * m - 14) / rowH), per = cols * perCol, pages = [];
    for (let i = 0; i < items.length; i += per) {
      let s = head(m + 6, `${st.title || 'Bingo'} – caller's checklist`);
      items.slice(i, i + per).forEach((v, j) => { const x = m + Math.floor(j / perCol) * cw, y = m + 14 + (j % perCol) * rowH; s += `<rect x="${f2(x)}" y="${f2(y + 1.5)}" width="5" height="5" fill="none" stroke="#111" stroke-width=".4"/>` + T(v, x + 8, y + 5.6, fit(v, 4.2, cw - 10, 400)); });
      pages.push(svgPage(W, H, s));
    }
    return pages;
  }
  const b75 = st.type === 'b75', rowsN = b75 ? 5 : 9, colsN = b75 ? 15 : 10, lab = b75 ? 12 : 0;
  const cw = (W - 2 * m - lab) / colsN, ch = Math.min(cw, 14), boardH = rowsN * ch;
  let s = '';
  for (let b = 0; b < (b75 ? 2 : 1); b++) {
    const y0 = m + 4 + b * (boardH + 40);
    s += head(y0 + 4, `${st.title || 'Bingo'} – game ${b + 1}`);
    for (let r = 0; r < rowsN; r++) {
      if (b75) s += `<rect x="${m}" y="${f2(y0 + 10 + r * ch)}" width="${lab}" height="${f2(ch)}" fill="${st.theme === 'ink' ? '#fff' : th.c}" stroke="#111" stroke-width=".4"/>` + T(LETTERS[r], m + lab / 2, y0 + 10 + r * ch + ch * 0.72, ch * 0.6, ` font-weight="800" fill="${st.theme === 'ink' ? '#111' : '#fff'}"`, 'middle');
      for (let c = 0; c < colsN; c++) {
        const v = b75 ? r * 15 + c + 1 : r * 10 + c + 1;
        if (!b75 && v > 90) continue;
        const x = m + lab + c * cw, y = y0 + 10 + r * ch;
        s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(cw)}" height="${f2(ch)}" fill="#fff" stroke="#111" stroke-width=".35"/>` + T(String(v), x + cw / 2, y + ch * 0.68, ch * 0.48, ' font-weight="600"', 'middle');
      }
    }
  }
  return [svgPage(W, H, s)];
}
function pages(screen) {
  let list = cardPages(screen);
  if (screen) return list;
  if (st.slips) list = list.concat(slipPages());
  if (st.checklist) list = list.concat(checklistPages());
  return list;
}
function totalPages() { const n = cardCount(), per = st.type === 'b90' ? 6 : ([1, 2, 4].includes(st.per) ? st.per : 4); return Math.ceil(n / per); }

// ---------- limits ----------
function limitReason() {
  if (unlocked()) return '';
  if (st.type === 'b90') return '90-ball tickets are part of BingoPress Pro.';
  if (cardCount() > FREE_CARDS) return `The free version prints up to ${FREE_CARDS} cards at a time. Pro prints up to ${MAX_CARDS}.`;
  return '';
}

if (typeof module !== 'undefined') module.exports = { get st() { return st; }, set st(v) { st = v; }, rng, pick, range, wordList, gridSize, wordsNeeded, card75, card90, cardWord, cards, cardCount, pool, callLabel, spoken, called, callNext, checkCard, cardPages, slipPages, checklistPages, pages, totalPages, limitReason, letterOf, resetCache: () => { cardCache = { key: '', list: [] }; } };

const WORD_SETS = {
  baby: 'Bottle\nDiapers\nPacifier\nRattle\nStroller\nBib\nOnesie\nCrib\nBlanket\nTeddy bear\nBooties\nCar seat\nLullaby\nWipes\nMittens\nSippy cup\nBath toys\nBaby monitor\nHigh chair\nNight light\nSwaddle\nTeething ring\nBoard book\nSocks\nSun hat\nBurp cloth\nMobile\nRocking chair\nBaby lotion\nHooded towel',
  xmas: 'Santa\nReindeer\nSnowman\nStocking\nCandy cane\nSleigh\nElf\nGingerbread\nWreath\nMistletoe\nPresents\nStar\nAngel\nBells\nHolly\nSnowflake\nChimney\nOrnament\nChristmas tree\nCookies\nHot cocoa\nLights\nCarols\nNutcracker\nMittens\nScarf\nFireplace\nRibbon',
  sight: 'the\nand\nyou\nthat\nwas\nfor\nare\nwith\nhis\nthey\nat\nbe\nthis\nfrom\nhave\nor\nby\none\nhad\nnot\nbut\nwhat\nall\nwere\nwhen\nwe\nthere\ncan\nan\nyour',
  road: 'Gas station\nCow\nRed car\nBridge\nStop sign\nTruck\nMotorcycle\nBus\nHorse\nPolice car\nTrain\nTunnel\nSpeed limit sign\nBarn\nRiver\nWater tower\nAirplane\nBicycle\nBillboard\nDog in a car\nTractor\nChurch\nFlag\nSchool bus\nMountain\nPicnic table\nFire truck\nTraffic light'
};
const WORD_TITLES = { baby: 'Baby Shower Bingo', xmas: 'Christmas Bingo', sight: 'Sight Word Bingo', road: 'Road Trip Bingo' };

if (typeof document !== 'undefined') (function () {
  let pgs = [], pageNo = 0, toastTimer;
  window.toast = function (msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000); };
  $('theme').innerHTML = Object.entries(THEMES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');

  function renderPage() {
    const p = pgs[pageNo];
    $('page').innerHTML = p.svg.replace(/ width="[\d.]+mm" height="[\d.]+mm"/, ` style="aspect-ratio:${p.w}/${p.h};width:min(100%, calc((100vh - 170px) * ${p.w / p.h}))"`);
    const total = totalPages(), shown = pgs.length;
    $('pager').textContent = total > shown ? `Preview of page ${pageNo + 1} of the first ${shown} (all ${total} pages print)` : (shown > 1 ? `Page ${pageNo + 1} of ${shown}` : 'Preview');
    $('prev').disabled = pageNo === 0; $('next').disabled = pageNo >= pgs.length - 1;
  }
  function info() {
    const n = cardCount(), cp = totalPages();
    const extra = [st.slips ? 'calling slips' : '', st.checklist ? "caller's checklist" : ''].filter(Boolean);
    $('pageInfo').textContent = `${n} ${st.type === 'b90' ? 'tickets' : 'cards'} on ${cp} page${cp > 1 ? 's' : ''}${extra.length ? ', plus ' + extra.join(' and ') : ''}.`;
    $('countHint').textContent = unlocked() ? `Up to ${MAX_CARDS}. Every card is different.` : `Free: up to ${FREE_CARDS} at a time. Pro: up to ${MAX_CARDS}.`;
    const hints = { b75: 'Classic American bingo: columns B-I-N-G-O, numbers 1–75, FREE space in the middle.', word: 'Bingo with words or short phrases – for parties, showers, classrooms and holidays.', b90: 'British bingo tickets: 3 rows of 9, numbers 1–90, 15 numbers per ticket. 6 tickets per page.' };
    $('typeHint').textContent = hints[st.type];
    if (st.type === 'word') { const n2 = wordList().length, need = wordsNeeded(); $('wordCount').textContent = n2 >= need ? `${n2} words – enough. More words make the cards more different.` : `${n2} words – a ${gridSize()} × ${gridSize()} card needs at least ${need}.`; }
  }
  window.renderAll = function () {
    document.querySelectorAll('#types button').forEach((b) => b.classList.toggle('on', b.dataset.t === st.type));
    ['title', 'paper', 'theme'].forEach((k) => { if (document.activeElement !== $(k)) $(k).value = st[k]; });
    if (document.activeElement !== $('count')) $('count').value = st.count;
    if (document.activeElement !== $('words')) $('words').value = st.words;
    $('per').value = String(st.per); $('grid').value = String(st.grid);
    $('slips').checked = !!st.slips; $('checklist').checked = !!st.checklist; $('speak').checked = !!st.speak;
    $('countLbl').textContent = st.type === 'b90' ? 'How many tickets' : 'How many cards';
    $('wordF').hidden = st.type !== 'word'; $('perF').hidden = st.type === 'b90';
    $('setNo').textContent = st.seed;
    $('cardsView').hidden = st.view === 'caller'; $('callerView').hidden = st.view !== 'caller';
    $('viewBtn').textContent = st.view === 'caller' ? '🃏 Back to cards' : '🎱 Call the game';
    $('printBtn').textContent = st.view === 'caller' ? '🖨 Print' : '🖨 Print cards';
    info();
    if (st.view === 'caller') renderCaller();
    else { pgs = pages(true); pageNo = Math.min(pageNo, pgs.length - 1); renderPage(); }
  };
  const change = () => { save(); renderAll(); };
  const refreshCards = () => { save(); info(); if (st.view !== 'caller') { pgs = pages(true); pageNo = Math.min(pageNo, pgs.length - 1); renderPage(); } };

  // ----- caller -----
  function ballHtml(v) {
    if (v == null) return '<span>–</span>';
    if (st.type === 'b75') return `<span style="flex-direction:column;line-height:1"><small style="font-size:.45em">${letterOf(v)}</small>${v}</span>`;
    return `<span>${esc(v)}</span>`;
  }
  function renderCaller() {
    const c = called(), last = c[c.length - 1], total = pool().length;
    const ball = $('ball'); ball.innerHTML = ballHtml(last);
    ball.classList.toggle('small-text', st.type === 'word' && last != null && String(last).length > 3);
    if (st.type === 'word' && last != null) ball.style.fontSize = String(last).length > 14 ? '22px' : String(last).length > 8 ? '28px' : '';
    else ball.style.fontSize = '';
    $('callCount').textContent = total ? `${c.length} of ${total} called${c.length > 1 ? ' · before that: ' + c.slice(-4, -1).reverse().map(callLabel).join(', ') : ''}` : 'Add words on the left first.';
    $('callBtn').disabled = c.length >= total; $('undoBtn').disabled = !c.length;
    const on = new Set(c.map(String)), lastS = String(last);
    const cellB = (v) => `<div class="bn${on.has(String(v)) ? ' on' : ''}${String(v) === lastS ? ' last' : ''}">${esc(v)}</div>`;
    const b = $('board');
    if (st.type === 'b75') { b.className = 'board'; b.style.gridTemplateColumns = '44px repeat(15, 1fr)'; b.innerHTML = [0, 1, 2, 3, 4].map((r) => `<div class="bl">${LETTERS[r]}</div>` + range(r * 15 + 1, r * 15 + 15).map(cellB).join('')).join(''); }
    else if (st.type === 'b90') { b.className = 'board'; b.style.gridTemplateColumns = 'repeat(10, 1fr)'; b.innerHTML = range(1, 90).map(cellB).join(''); }
    else { b.className = 'board words'; b.style.gridTemplateColumns = ''; b.innerHTML = pool().map(cellB).join(''); }
  }
  function say(v) {
    if (!st.speak || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(spoken(v)); u.rate = 0.85; speechSynthesis.speak(u); } catch (_) {}
  }
  function next() { const v = callNext(); if (v == null) { toast('Everything has been called.'); return; } save(); renderCaller(); say(v); }
  function showCheck() {
    const no = Number($('chkNo').value);
    if (!no) { $('chkOut').innerHTML = ''; return; }
    if (no > MAX_CARDS) { $('chkOut').innerHTML = `<p class="verdict">There is no card ${no}.</p>`; return; }
    if (no > cardCount()) { $('chkOut').innerHTML = `<p class="verdict">Card ${no} was not printed – this set has ${cardCount()} cards.</p>`; return; }
    const r = checkCard(no);
    if (!r) { $('chkOut').innerHTML = '<p class="verdict">That card cannot be made – check the words list.</p>'; return; }
    const head = r.wins.length ? `<p class="verdict win">BINGO! ✔ ${esc(r.wins.join(', '))}</p>` : '<p class="verdict">Not yet – no complete line.</p>';
    let grid = '';
    if (r.card.rows) grid = '<table class="mini">' + r.card.rows.map((row, ri) => '<tr>' + row.map((v, ci) => `<td class="${v === null ? 'free' : r.marks[ri][ci] ? 'on' : ''}">${v === null ? '' : v}</td>`).join('') + '</tr>').join('') + '</table>';
    else { const k = Math.round(Math.sqrt(r.card.cells.length)); grid = '<table class="mini">' + (st.type === 'b75' ? '<tr>' + [...LETTERS].map((l) => `<td class="free">${l}</td>`).join('') + '</tr>' : '') + range(0, k - 1).map((ri) => '<tr>' + range(0, k - 1).map((ci) => { const i = ri * k + ci, v = r.card.cells[i]; return `<td class="${v === null ? 'free' : r.marks[i] ? 'on' : ''}">${v === null ? '★' : esc(v)}</td>`; }).join('') + '</tr>').join('') + '</table>'; }
    $('chkOut').innerHTML = head + `<p class="hint">Card ${fmtNo(no)}, set ${st.seed}. Orange squares have been called.</p>` + grid;
  }

  // ----- printing -----
  function printNow() {
    const r = limitReason(); if (r) { openPro(r); return; }
    const list = pages(false), p = list[0];
    if (st.type === 'word' && wordList().length < wordsNeeded()) { toast(`Add at least ${wordsNeeded()} different words first.`); return; }
    $('pageRule').textContent = `@page { size: ${p.w}mm ${p.h}mm; margin: 0; } @media print { #printArea svg { width: ${p.w}mm !important; height: ${p.h}mm !important; } }`;
    $('printArea').innerHTML = list.map((x) => x.svg).join('');
    window.print();
  }

  // ----- events -----
  document.querySelectorAll('#types button').forEach((b) => { b.onclick = () => { st.type = b.dataset.t; pageNo = 0; $('chkOut').innerHTML = ''; change(); if (st.type === 'b90' && !unlocked()) toast('90-ball tickets are part of Pro. You can look at the preview for free.'); }; });
  $('words').oninput = () => { st.words = $('words').value; refreshCards(); };
  $('grid').onchange = () => { st.grid = Number($('grid').value); pageNo = 0; refreshCards(); };
  $('wordEx').onchange = () => { const k = $('wordEx').value; $('wordEx').value = ''; if (!k) return; if (st.words.trim() && !confirm('Replace your words with this ready-made list?')) return; st.words = WORD_SETS[k]; if (!st.title || st.title === 'BINGO NIGHT' || Object.values(WORD_TITLES).includes(st.title)) st.title = WORD_TITLES[k]; change(); };
  $('count').oninput = () => { const v = Math.floor(Number($('count').value)); if (v >= 1) { st.count = Math.min(MAX_CARDS, v); refreshCards(); } };
  $('count').onchange = () => { if (!(Number($('count').value) >= 1)) st.count = 1; if (st.count > FREE_CARDS && !unlocked()) toast(`The free version prints ${FREE_CARDS} cards at a time – print them, then print again, or get Pro.`); change(); };
  $('per').onchange = () => { st.per = Number($('per').value); pageNo = 0; refreshCards(); };
  $('title').oninput = () => { st.title = $('title').value; refreshCards(); };
  $('theme').onchange = () => { st.theme = $('theme').value; refreshCards(); };
  $('paper').onchange = () => { st.paper = $('paper').value; refreshCards(); };
  $('slips').onchange = () => { st.slips = $('slips').checked; refreshCards(); };
  $('checklist').onchange = () => { st.checklist = $('checklist').checked; refreshCards(); };
  $('newSet').onclick = () => { if (!confirm('Make a brand-new set of cards? Cards you already printed will not match the new card numbers.')) return; st.seed = newSeed(); pageNo = 0; change(); toast(`New set ${st.seed}. Print the new cards before you play.`); };
  $('viewBtn').onclick = () => { st.view = st.view === 'caller' ? 'cards' : 'caller'; change(); if (st.view === 'caller') $('callBtn').focus(); };
  $('callBtn').onclick = next;
  $('undoBtn').onclick = () => { called().pop(); save(); renderCaller(); };
  $('newGame').onclick = () => { if (called().length && !confirm('Start a new game? The called numbers will be cleared. The cards stay the same.')) return; st.calls[st.type] = []; $('chkOut').innerHTML = ''; save(); renderCaller(); };
  $('speak').onchange = () => { st.speak = $('speak').checked; save(); };
  $('chkBtn').onclick = showCheck;
  $('chkNo').onkeydown = (e) => { if (e.key === 'Enter') showCheck(); };
  document.addEventListener('keydown', (e) => {
    if (st.view !== 'caller' || e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Space' || e.key === 'Enter') { if (e.target.tagName === 'BUTTON' && e.target !== $('callBtn')) return; e.preventDefault(); next(); }
  });
  $('prev').onclick = () => { if (pageNo > 0) { pageNo--; renderPage(); } };
  $('next').onclick = () => { if (pageNo < pgs.length - 1) { pageNo++; renderPage(); } };
  $('printBtn').onclick = printNow;
  $('moreBtn').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
  document.addEventListener('click', () => { $('menu').hidden = true; });
  $('exBtn').onclick = () => { Object.assign(st, { type: 'b75', count: FREE_CARDS, per: 4, title: 'Family Bingo Night', theme: 'blue', slips: true, checklist: true, view: 'cards' }); pageNo = 0; change(); };
  $('resetBtn').onclick = () => { if (confirm('Start again with a new set of cards and default settings?')) { try { localStorage.removeItem('bingopress'); } catch (_) {} location.reload(); } };
  $('proBtn').onclick = () => { if (!isPro) openPro(''); };
  $('buyBtn').onclick = buyPro;
  $('restoreBtn').onclick = async () => { proMessage((await checkPro()) ? 'Pro is unlocked. ★' : 'No purchase was found on this Microsoft account.'); };
  $('closePro').onclick = () => $('proDialog').close();
  window.addEventListener('resize', () => { if (st.view !== 'caller') renderPage(); });
  setPro(isPro);
  checkPro();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
