'use strict';

/* =========================================================
   Finanze — web app minimal per gestire saldi e spese.
   Tutti i dati restano nel browser (localStorage).
   Gli importi sono salvati in centesimi (interi).
   ========================================================= */

const KEY = 'finanze-data-v1';
const OTHER = '__altro__';
const CATS = {
  expense: ['Cibo', 'Trasporti', 'Sport', 'Abbigliamento', 'Svago', 'Casa', 'Salute', 'Abbonamenti'],
  income: ['Stipendio', 'Regalo', 'Rimborso', 'Vendita'],
};
const TYPES = [['carta', 'Carta'], ['contanti', 'Contanti'], ['investiti', 'Investiti']];
const KIND_LABEL = { expense: 'Spesa', income: 'Entrata', transfer: 'Trasferimento' };
const SAVED_MSG = { expense: 'Spesa salvata', income: 'Entrata salvata', transfer: 'Trasferimento salvato' };

const ICON = {
  left: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

/* ---------------- utilità ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const total = (list) => list.reduce((s, t) => s + t.amt, 0);

// useGrouping 'always' → "1.250,50 €" (di default l'italiano non separa le migliaia sotto 10.000)
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const INT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' });
const fmt = (cents) => EUR.format(cents / 100);
const toInput = (cents) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');

function parseAmount(str) {
  let s = String(str || '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/* ---------------- date ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const curMonth = () => today().slice(0, 7);
const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const daysIn = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const monthLabel = (mk) => cap(parseISO(mk).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
const monthName = (mk) => parseISO(mk).toLocaleDateString('it-IT', { month: 'long' });
const monthShort = (mk) => parseISO(mk).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
const longDate = (iso) => parseISO(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
function dayLabel(iso) {
  if (iso === today()) return 'Oggi';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === isoDate(y)) return 'Ieri';
  return cap(parseISO(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
}

/* ---------------- dati ---------------- */
function fresh() {
  return {
    v: 1,
    accounts: [
      { id: uid(), name: 'Carta', type: 'carta', base: 0 },
      { id: uid(), name: 'Contanti', type: 'contanti', base: 0 },
      { id: uid(), name: 'Investimenti', type: 'investiti', base: 0 },
    ],
    tx: [],
    rec: [],
    cats: { expense: [], income: [] },
    prefs: {},
  };
}

function normalize(d) {
  if (!d || !Array.isArray(d.accounts) || !Array.isArray(d.tx)) throw new Error('Formato non valido');
  return {
    v: 1,
    accounts: d.accounts,
    tx: d.tx,
    rec: Array.isArray(d.rec) ? d.rec : [],
    cats: { expense: d.cats?.expense || [], income: d.cats?.income || [] },
    prefs: d.prefs || {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* dati assenti o illeggibili */ }
  return fresh();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    toast('Errore nel salvataggio');
  }
}

const accById = (id) => S.accounts.find((a) => a.id === id);
const accName = (id) => accById(id)?.name || 'Conto eliminato';
const accountsFor = (kind) => (kind === 'expense' ? S.accounts.filter((a) => a.type !== 'investiti') : S.accounts);

// saldo = valore iniziale + entrate − spese ± trasferimenti
function balances() {
  const b = Object.fromEntries(S.accounts.map((a) => [a.id, a.base]));
  for (const t of S.tx) {
    if (t.kind === 'income') { if (t.acc in b) b[t.acc] += t.amt; }
    else if (t.kind === 'expense') { if (t.acc in b) b[t.acc] -= t.amt; }
    else if (t.kind === 'transfer') {
      if (t.acc in b) b[t.acc] -= t.amt;
      if (t.to in b) b[t.to] += t.amt;
    }
  }
  return b;
}

// genera i movimenti ricorrenti dei mesi arrivati a scadenza
function runRecurring() {
  const t = today();
  const cm = curMonth();
  let added = 0;
  for (const r of S.rec) {
    let mk = addMonths(r.last, 1);
    while (mk <= cm) {
      const date = `${mk}-${pad(Math.min(r.day, daysIn(mk)))}`;
      if (date > t) break;
      const tx = { id: uid(), ts: Date.now(), kind: r.kind, amt: r.amt, acc: r.acc, note: r.note || '', date, rec: r.id };
      if (r.kind === 'transfer') tx.to = r.to;
      else tx.cat = r.cat;
      S.tx.push(tx);
      r.last = mk;
      added++;
      mk = addMonths(mk, 1);
    }
  }
  if (added) save();
  return added;
}

function catList(kind, extra) {
  const list = [...CATS[kind], ...S.cats[kind].filter((c) => !CATS[kind].includes(c))];
  if (extra && !list.includes(extra)) list.push(extra);
  return list;
}

// salva una categoria scritta a mano, così la ritrovi la prossima volta
function rememberCat(kind, name) {
  const found = catList(kind).find((c) => c.toLowerCase() === name.toLowerCase());
  if (found) return found;
  S.cats[kind].push(name);
  return name;
}

/* ---------------- stato UI ---------------- */
let S = load();
let view = 'saldi';
let month = curMonth();
let filter = 'all';
const sheet = $('#sheet');

function maxMonth() {
  let m = curMonth();
  for (const t of S.tx) if (t.date.slice(0, 7) > m) m = t.date.slice(0, 7);
  return m;
}

function monthNav() {
  return `<div class="month-nav">
    <button data-act="month" data-id="-1" aria-label="Mese precedente">${ICON.left}</button>
    <span>${monthLabel(month)}</span>
    <button data-act="month" data-id="1" aria-label="Mese successivo" ${month >= maxMonth() ? 'disabled' : ''}>${ICON.right}</button>
  </div>`;
}

function setView(v) {
  view = v;
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
  document.querySelectorAll('.tabbar [data-act="tab"]').forEach((b) => b.classList.toggle('on', b.dataset.id === v));
  window.scrollTo(0, 0);
  render();
}

function render() {
  ({ saldi: renderSaldi, movimenti: renderMovimenti, statistiche: renderStatistiche, altro: renderAltro })[view]();
}

/* ---------------- vista: Saldi ---------------- */
function renderSaldi() {
  const b = balances();
  const byType = (type) => S.accounts.filter((a) => a.type === type).reduce((s, a) => s + b[a.id], 0);
  const liquid = byType('carta') + byType('contanti');
  const invested = byType('investiti');
  const cm = curMonth();
  const mtx = S.tx.filter((t) => t.date.startsWith(cm));
  const spent = total(mtx.filter((t) => t.kind === 'expense'));
  const earned = total(mtx.filter((t) => t.kind === 'income'));

  let html = `<h1 class="title">Saldi</h1>
    <div class="hero">
      <div class="label">Patrimonio totale</div>
      <div class="big">${fmt(liquid + invested)}</div>
      <div class="sub">Liquidità ${fmt(liquid)} · Investiti ${fmt(invested)}</div>
    </div>
    <div class="tiles">
      <button class="tile" data-act="go-mov"><div class="label">Spese di ${monthName(cm)}</div><div class="val">${fmt(spent)}</div></button>
      <button class="tile" data-act="go-mov"><div class="label">Entrate di ${monthName(cm)}</div><div class="val pos">${fmt(earned)}</div></button>
    </div>`;

  for (const [type, label] of TYPES) {
    const accs = S.accounts.filter((a) => a.type === type);
    if (!accs.length) continue;
    html += `<div class="group-head"><span>${label}</span>${accs.length > 1 ? `<span class="num">${fmt(byType(type))}</span>` : ''}</div>
      <div class="list">${accs
        .map((a) => `<button class="row" data-act="acc" data-id="${a.id}">
            <span class="row-main">${esc(a.name)}</span>
            <span class="row-amt">${fmt(b[a.id])}</span>
            <span class="chev">${ICON.chev}</span>
          </button>`)
        .join('')}</div>`;
  }
  html += `<button class="link-btn" data-act="new-acc">+ Aggiungi conto</button>`;

  if (!S.tx.length && S.accounts.every((a) => !a.base)) {
    html += `<p class="hint">Tocca un conto per inserire quanto hai, poi usa il + in basso per registrare spese ed entrate.</p>`;
  }
  const lb = S.prefs.lastBackup;
  if (S.tx.length >= 10 && (!lb || Date.now() - parseISO(lb).getTime() > 30 * 864e5)) {
    html += `<p class="hint">I dati sono salvati solo su questo iPhone. <button class="link-btn" style="display:inline;width:auto;padding:0" data-act="tab" data-id="altro">Fai un backup</button></p>`;
  }
  $('#view-saldi').innerHTML = html;
}

/* ---------------- vista: Movimenti ---------------- */
function txRow(t) {
  let title, sub, amt, cls = '';
  if (t.kind === 'transfer') {
    title = 'Trasferimento';
    sub = `${accName(t.acc)} → ${accName(t.to)}`;
    amt = fmt(t.amt);
    cls = 'muted';
  } else {
    title = t.cat;
    sub = accName(t.acc);
    amt = (t.kind === 'expense' ? '−' : '+') + fmt(t.amt);
    if (t.kind === 'income') cls = 'pos';
  }
  if (t.note) sub = `${t.note} · ${sub}`;
  return `<button class="row" data-act="tx" data-id="${t.id}">
    <span class="row-text">
      <span class="row-main">${esc(title)}${t.rec ? ' <span class="rec">↻</span>' : ''}</span>
      <span class="row-sub">${esc(sub)}</span>
    </span>
    <span class="row-amt ${cls}">${amt}</span>
  </button>`;
}

function renderMovimenti() {
  const mtx = S.tx.filter((t) => t.date.startsWith(month));
  const spent = total(mtx.filter((t) => t.kind === 'expense'));
  const earned = total(mtx.filter((t) => t.kind === 'income'));
  const list = mtx
    .filter((t) => filter === 'all' || t.kind === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));

  let html = `<h1 class="title">Movimenti</h1>${monthNav()}
    <div class="seg seg-wrap">${[['all', 'Tutti'], ['expense', 'Spese'], ['income', 'Entrate']]
      .map(([k, l]) => `<button data-act="filter" data-id="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`)
      .join('')}</div>
    <div class="summary"><span>Spese <b>${fmt(spent)}</b></span><span>Entrate <b class="pos">${fmt(earned)}</b></span></div>`;

  if (!list.length) {
    html += `<p class="empty">Nessun movimento a ${monthName(month)}.</p>`;
  } else {
    const days = [];
    for (const t of list) {
      if (!days.length || days[days.length - 1].date !== t.date) days.push({ date: t.date, items: [] });
      days[days.length - 1].items.push(t);
    }
    for (const d of days) {
      const daySpent = total(d.items.filter((t) => t.kind === 'expense'));
      html += `<div class="group-head"><span>${dayLabel(d.date)}</span>${daySpent ? `<span class="num">−${fmt(daySpent)}</span>` : ''}</div>
        <div class="list">${d.items.map(txRow).join('')}</div>`;
    }
  }
  $('#view-movimenti').innerHTML = html;
}

/* ---------------- vista: Statistiche ---------------- */
function renderStatistiche() {
  const mtx = S.tx.filter((t) => t.date.startsWith(month));
  const exp = mtx.filter((t) => t.kind === 'expense');
  const spent = total(exp);
  const earned = total(mtx.filter((t) => t.kind === 'income'));
  const prev = addMonths(month, -1);
  const prevSpent = total(S.tx.filter((t) => t.kind === 'expense' && t.date.startsWith(prev)));
  const saved = earned - spent;

  let compare = '';
  if (prevSpent) {
    const d = Math.round(((spent - prevSpent) / prevSpent) * 100);
    compare = `${d > 0 ? '+' : ''}${d}% rispetto a ${monthName(prev)}`;
  }

  let html = `<h1 class="title">Statistiche</h1>${monthNav()}
    <div class="hero" style="margin-top:22px">
      <div class="label">Speso a ${monthName(month)}</div>
      <div class="big">${fmt(spent)}</div>
      ${compare ? `<div class="sub">${compare}</div>` : ''}
    </div>
    <div class="tiles">
      <div class="tile"><div class="label">Entrate</div><div class="val pos">${fmt(earned)}</div></div>
      <div class="tile"><div class="label">${saved >= 0 ? 'Risparmiato' : 'Sforato'}</div><div class="val ${saved >= 0 ? '' : 'danger'}">${fmt(Math.abs(saved))}</div></div>
    </div>`;

  // per categoria
  html += `<div class="group-head"><span>Per categoria</span></div>`;
  if (!spent) {
    html += `<p class="hint">Nessuna spesa registrata in questo mese.</p>`;
  } else {
    const byCat = {};
    for (const t of exp) byCat[t.cat] = (byCat[t.cat] || 0) + t.amt;
    html += `<div class="list">${Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => {
        const p = (v / spent) * 100;
        return `<div class="cat-row">
          <div class="cat-top"><span>${esc(c)}<span class="pct">${Math.round(p)}%</span></span><span class="num">${fmt(v)}</span></div>
          <div class="bar"><i style="width:${p.toFixed(1)}%"></i></div>
        </div>`;
      })
      .join('')}</div>`;

    // carta vs contanti
    let card = 0, cash = 0;
    for (const t of exp) {
      const type = accById(t.acc)?.type;
      if (type === 'contanti') cash += t.amt;
      else if (type) card += t.amt;
    }
    const known = card + cash;
    if (known) {
      const pc = (card / known) * 100;
      html += `<div class="group-head"><span>Carta e contanti</span></div>
        <div class="split-box">
          <div class="split"><i style="width:${pc.toFixed(1)}%;background:#fff"></i><i style="width:${(100 - pc).toFixed(1)}%;background:#636366"></i></div>
          <div class="legend">
            <span><span class="dot" style="background:#fff"></span>Carta <span class="num">${fmt(card)}</span></span>
            <span><span class="dot" style="background:#636366"></span>Contanti <span class="num">${fmt(cash)}</span></span>
          </div>
        </div>`;
    }
  }

  // ultimi 6 mesi
  const months = [-5, -4, -3, -2, -1, 0].map((i) => addMonths(month, i));
  const vals = months.map((mk) => total(S.tx.filter((t) => t.kind === 'expense' && t.date.startsWith(mk))));
  const max = Math.max(...vals, 1);
  html += `<div class="group-head"><span>Spese ultimi 6 mesi</span></div>
    <div class="chart">${months
      .map((mk, i) => `<button class="col ${mk === month ? 'on' : ''}" data-act="goto-month" data-id="${mk}">
          <span class="v">${vals[i] ? INT.format(Math.round(vals[i] / 100)) : ''}</span>
          <span class="b" style="height:${((vals[i] / max) * 100).toFixed(1)}%"></span>
          <span class="m">${monthShort(mk)}</span>
        </button>`)
      .join('')}</div>`;

  $('#view-statistiche').innerHTML = html;
}

/* ---------------- vista: Altro ---------------- */
function renderAltro() {
  let html = `<h1 class="title">Altro</h1>
    <div class="group-head"><span>Ricorrenti</span></div>`;

  if (S.rec.length) {
    html += `<div class="list">${S.rec
      .map((r) => {
        const kindName = r.kind === 'transfer' ? 'Trasferimento' : r.cat;
        const title = r.note || kindName;
        const where = r.kind === 'transfer' ? `${accName(r.acc)} → ${accName(r.to)}` : accName(r.acc);
        const sub = `${r.note ? `${kindName} · ` : ''}Ogni mese il ${r.day} · ${where}`;
        const sign = r.kind === 'expense' ? '−' : r.kind === 'income' ? '+' : '';
        return `<button class="row" data-act="rec" data-id="${r.id}">
          <span class="row-text"><span class="row-main">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></span>
          <span class="row-amt ${r.kind === 'income' ? 'pos' : r.kind === 'transfer' ? 'muted' : ''}">${sign}${fmt(r.amt)}</span>
        </button>`;
      })
      .join('')}</div>`;
  } else {
    html += `<p class="hint">Nessuna ricorrenza. Affitto, abbonamenti o stipendio: attiva «Ripeti ogni mese» quando li inserisci e verranno registrati da soli ogni mese.</p>`;
  }
  html += `<button class="link-btn" data-act="new-rec">+ Nuova ricorrenza</button>`;

  const customs = [
    ...S.cats.expense.map((c) => ['expense', c]),
    ...S.cats.income.map((c) => ['income', c]),
  ];
  if (customs.length) {
    html += `<div class="group-head"><span>Categorie personalizzate</span></div>
      <div class="list">${customs
        .map(([k, c]) => `<div class="row">
          <span class="row-text"><span class="row-main">${esc(c)}</span><span class="row-sub">${k === 'expense' ? 'Spesa' : 'Entrata'}</span></span>
          <button class="small-btn" data-act="del-cat" data-kind="${k}" data-id="${esc(c)}">Rimuovi</button>
        </div>`)
        .join('')}</div>`;
  }

  html += `<div class="group-head"><span>Backup</span></div>
    <div class="list">
      <button class="row" data-act="export"><span class="row-main">Esporta backup</span><span class="chev">${ICON.chev}</span></button>
      <button class="row" data-act="import"><span class="row-main">Ripristina da backup</span><span class="chev">${ICON.chev}</span></button>
    </div>
    <p class="hint">I dati sono salvati solo su questo dispositivo. Esporta un backup ogni tanto (ad esempio su File o iCloud Drive) per non perderli.<br>
    ${S.prefs.lastBackup ? `Ultimo backup: ${longDate(S.prefs.lastBackup)}.` : 'Nessun backup ancora.'}</p>

    <div class="list" style="margin-top:24px">
      <button class="row danger" data-act="reset"><span class="row-main">Cancella tutti i dati</span></button>
    </div>
    <p class="foot">Finanze · v1.0</p>`;

  $('#view-altro').innerHTML = html;
}

/* ---------------- sheet ---------------- */
function openSheet(html) {
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  sheet.onclick = null;
  document.body.classList.add('sheet-open');
}

function closeSheet() {
  document.body.classList.remove('sheet-open');
  if (document.activeElement) document.activeElement.blur();
}

const head = (title) => `<div class="sheet-head">
  <button class="txt-btn" data-act="close">Annulla</button>
  <div class="sheet-title">${title}</div>
  <button class="txt-btn strong" data-a="save">Salva</button>
</div>`;

const field = (label, inner) => `<div class="field"><span class="flabel">${label}</span>${inner}</div>`;

const chipsAcc = (accs, selected, attr) => `<div class="chips">${accs
  .map((a) => `<button class="chip ${a.id === selected ? 'on' : ''}" data-${attr}="${a.id}">${esc(a.name)}</button>`)
  .join('')}</div>`;

const amountInput = (cents) => `<label class="amount"><input id="amt" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${toInput(cents)}"><span>€</span></label>`;

function fitAmount(el) {
  const fit = () => { el.style.width = `${Math.max(4.5, el.value.length + 0.6)}ch`; };
  el.addEventListener('input', fit);
  fit();
}

/* ----- nuovo / modifica movimento ----- */
function openTx(existing, opts = {}) {
  const isEdit = !!existing;
  const d = isEdit
    ? { kind: existing.kind, acc: existing.acc, to: existing.to, cat: existing.cat }
    : { kind: 'expense', acc: null, to: null, cat: null };
  let other = '';
  let repeat = !!opts.repeat;

  openSheet(`${head(isEdit ? 'Modifica' : 'Nuovo movimento')}
    <div class="sheet-body">
      <div class="seg" id="kind">${Object.entries(KIND_LABEL).map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      ${amountInput(existing?.amt)}
      <div id="dyn"></div>
      ${field('Nota', `<input id="note" class="input" placeholder="Facoltativa" maxlength="60" autocomplete="off" value="${esc(existing?.note || '')}">`)}
      ${field('Data', `<input id="date" class="input" type="date" value="${existing?.date || today()}">`)}
      ${isEdit
        ? (existing.rec ? '<p class="hint" style="margin-top:18px">↻ Fa parte di una ricorrenza: le modifiche valgono solo per questo movimento. Per cambiare la ricorrenza vai in Altro.</p>' : '')
        : `<div class="switch-row"><span>Ripeti ogni mese</span><button class="switch" data-a="repeat" role="switch" aria-checked="${repeat}" aria-label="Ripeti ogni mese"></button></div>`}
      ${isEdit ? '<button class="danger-btn" data-a="delete">Elimina movimento</button>' : ''}
    </div>`);

  const amtEl = $('#amt', sheet);
  fitAmount(amtEl);

  function draw() {
    sheet.querySelectorAll('#kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === d.kind));
    const dyn = $('#dyn', sheet);

    if (d.kind === 'transfer') {
      if (!accById(d.acc)) d.acc = S.accounts[0]?.id;
      if (!accById(d.to) || d.to === d.acc) d.to = S.accounts.find((a) => a.id !== d.acc)?.id;
      dyn.innerHTML = S.accounts.length < 2
        ? '<p class="hint" style="margin-top:20px">Servono almeno due conti per un trasferimento.</p>'
        : field('Da', chipsAcc(S.accounts, d.acc, 'from')) + field('A', chipsAcc(S.accounts, d.to, 'to'));
      return;
    }

    const accs = accountsFor(d.kind);
    if (!accs.some((a) => a.id === d.acc)) {
      d.acc = (accs.find((a) => a.id === S.prefs[`last_${d.kind}`]) || accs[0])?.id;
    }
    const list = catList(d.kind, isEdit && existing.kind === d.kind ? existing.cat : null);
    if (d.cat !== OTHER && !list.includes(d.cat)) d.cat = null;

    dyn.innerHTML =
      field(d.kind === 'expense' ? 'Pagato con' : 'Su quale conto',
        accs.length ? chipsAcc(accs, d.acc, 'acc') : '<p class="hint">Aggiungi prima un conto nella sezione Saldi.</p>') +
      field('Categoria', `<div class="chips">
          ${list.map((c) => `<button class="chip ${c === d.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}
          <button class="chip ${d.cat === OTHER ? 'on' : ''}" data-c="${OTHER}">Altro…</button>
        </div>
        ${d.cat === OTHER ? `<input id="other" class="input" style="margin-top:10px" placeholder="Scrivi il tipo di ${d.kind === 'expense' ? 'spesa' : 'entrata'}" maxlength="30" autocomplete="off" value="${esc(other)}">` : ''}`);

    const o = $('#other', sheet);
    if (o) o.addEventListener('input', () => { other = o.value; });
  }

  function submit() {
    const amt = parseAmount(amtEl.value);
    if (!(amt > 0)) return toast('Inserisci un importo');
    const date = $('#date', sheet).value || today();
    const note = $('#note', sheet).value.trim();
    const t = { kind: d.kind, amt, acc: d.acc, note, date };

    if (d.kind === 'transfer') {
      if (!d.acc || !d.to || d.acc === d.to) return toast('Scegli due conti diversi');
      t.to = d.to;
    } else {
      if (!accById(d.acc)) return toast('Scegli un conto');
      let cat = d.cat;
      if (cat === OTHER) {
        cat = cap(other.trim());
        if (!cat) return toast('Scrivi la categoria');
        cat = rememberCat(d.kind, cat);
      }
      if (!cat) return toast('Scegli una categoria');
      t.cat = cat;
      S.prefs[`last_${d.kind}`] = d.acc;
    }

    if (isEdit) {
      const orig = S.tx.find((x) => x.id === existing.id);
      delete orig.to;
      delete orig.cat;
      Object.assign(orig, t);
    } else {
      t.id = uid();
      t.ts = Date.now();
      if (repeat) {
        const r = { id: uid(), kind: t.kind, amt, acc: t.acc, note, day: Number(date.slice(8)), last: date.slice(0, 7) };
        if (t.kind === 'transfer') r.to = t.to;
        else r.cat = t.cat;
        S.rec.push(r);
        t.rec = r.id;
      }
      S.tx.push(t);
    }
    save();
    closeSheet();
    render();
    toast(isEdit ? 'Modifica salvata' : SAVED_MSG[d.kind]);
  }

  sheet.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.k) { d.kind = ds.k; draw(); }
    else if (ds.c) {
      d.cat = ds.c;
      draw();
      if (d.cat === OTHER) $('#other', sheet)?.focus();
    }
    else if (ds.acc) { d.acc = ds.acc; draw(); }
    else if (ds.from) { d.acc = ds.from; draw(); }
    else if (ds.to) {
      if (ds.to === d.acc) d.acc = d.to; // scambia
      d.to = ds.to;
      draw();
    }
    else if (ds.a === 'repeat') { repeat = !repeat; b.setAttribute('aria-checked', String(repeat)); }
    else if (ds.a === 'save') submit();
    else if (ds.a === 'delete') {
      if (!confirm('Eliminare questo movimento?')) return;
      S.tx = S.tx.filter((x) => x.id !== existing.id);
      save();
      closeSheet();
      render();
      toast('Movimento eliminato');
    }
  };

  draw();
  if (!isEdit) amtEl.focus();
}

/* ----- conto ----- */
function openAccount(id) {
  const acc = accById(id);
  const bal = acc ? balances()[acc.id] : 0;
  let type = acc?.type || 'carta';

  openSheet(`${head(acc ? 'Conto' : 'Nuovo conto')}
    <div class="sheet-body">
      ${field('Nome', `<input id="name" class="input" maxlength="30" autocomplete="off" placeholder="Es. Revolut, Portafoglio, ETF" value="${esc(acc?.name || '')}">`)}
      ${field('Tipo', `<div class="seg" id="type">${TYPES.map(([k, l]) => `<button data-t="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
      ${field(acc ? 'Saldo attuale' : 'Quanto c’è ora', `<div class="input-eur"><input id="bal" class="input num" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${toInput(bal)}"><span>€</span></div>`)}
      <p class="hint">${acc ? 'Puoi correggere il saldo quando vuoi: i movimenti già inseriti non cambiano.' : 'Per gli investimenti inserisci il valore attuale e aggiornalo quando cambia.'}</p>
      ${acc ? '<button class="danger-btn" data-a="delete">Elimina conto</button>' : ''}
    </div>`);

  sheet.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.t) {
      type = b.dataset.t;
      sheet.querySelectorAll('#type button').forEach((x) => x.classList.toggle('on', x.dataset.t === type));
    } else if (b.dataset.a === 'save') {
      const raw = $('#bal', sheet).value.trim();
      const newBal = raw ? parseAmount(raw) : 0;
      if (Number.isNaN(newBal)) return toast('Importo non valido');
      const name = $('#name', sheet).value.trim() || TYPES.find(([k]) => k === type)[1];
      if (acc) {
        acc.base = newBal - (bal - acc.base);
        acc.name = name;
        acc.type = type;
      } else {
        S.accounts.push({ id: uid(), name, type, base: newBal });
      }
      save();
      closeSheet();
      render();
      toast(acc ? 'Conto aggiornato' : 'Conto aggiunto');
    } else if (b.dataset.a === 'delete') {
      const used = S.tx.some((t) => t.acc === acc.id || t.to === acc.id);
      const recs = S.rec.some((r) => r.acc === acc.id || r.to === acc.id);
      let msg = `Eliminare il conto «${acc.name}»?`;
      if (used) msg += ' I movimenti collegati resteranno nello storico.';
      if (recs) msg += ' Le ricorrenze collegate verranno interrotte.';
      if (!confirm(msg)) return;
      S.accounts = S.accounts.filter((a) => a.id !== acc.id);
      S.rec = S.rec.filter((r) => r.acc !== acc.id && r.to !== acc.id);
      save();
      closeSheet();
      render();
      toast('Conto eliminato');
    }
  };

  if (!acc) $('#name', sheet).focus();
}

/* ----- ricorrenza ----- */
function openRule(id) {
  const r = S.rec.find((x) => x.id === id);
  if (!r) return;
  let acc = r.acc;
  const title = r.kind === 'transfer' ? `Trasferimento · ${accName(r.acc)} → ${accName(r.to)}` : `${r.cat} · ${KIND_LABEL[r.kind]}`;

  openSheet(`${head('Ricorrenza')}
    <div class="sheet-body">
      <p class="rule-title">${esc(title)}</p>
      ${amountInput(r.amt)}
      ${r.kind !== 'transfer' ? field(r.kind === 'expense' ? 'Pagato con' : 'Su quale conto', `<div id="accs">${chipsAcc(accountsFor(r.kind), acc, 'acc')}</div>`) : ''}
      ${field('Giorno del mese', `<input id="day" class="input num" inputmode="numeric" maxlength="2" autocomplete="off" value="${r.day}">`)}
      ${field('Nota', `<input id="note" class="input" placeholder="Facoltativa" maxlength="60" autocomplete="off" value="${esc(r.note || '')}">`)}
      <p class="hint">Le modifiche valgono dai prossimi mesi: i movimenti già registrati non cambiano.</p>
      <button class="danger-btn" data-a="delete">Interrompi ricorrenza</button>
    </div>`);

  const amtEl = $('#amt', sheet);
  fitAmount(amtEl);

  sheet.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.acc) {
      acc = b.dataset.acc;
      $('#accs', sheet).innerHTML = chipsAcc(accountsFor(r.kind), acc, 'acc');
    } else if (b.dataset.a === 'save') {
      const amt = parseAmount(amtEl.value);
      if (!(amt > 0)) return toast('Inserisci un importo');
      const day = parseInt($('#day', sheet).value, 10);
      if (!(day >= 1 && day <= 31)) return toast('Giorno tra 1 e 31');
      Object.assign(r, { amt, day, acc, note: $('#note', sheet).value.trim() });
      save();
      closeSheet();
      render();
      toast('Ricorrenza aggiornata');
    } else if (b.dataset.a === 'delete') {
      if (!confirm('Interrompere questa ricorrenza? I movimenti già registrati restano.')) return;
      S.rec = S.rec.filter((x) => x.id !== r.id);
      S.tx.forEach((t) => { if (t.rec === r.id) delete t.rec; });
      save();
      closeSheet();
      render();
      toast('Ricorrenza interrotta');
    }
  };
}

/* ---------------- backup ---------------- */
async function exportData() {
  const name = `finanze-backup-${today()}.json`;
  const data = JSON.stringify({ app: 'finanze', exportedAt: new Date().toISOString(), ...S }, null, 2);
  const file = new File([data], name, { type: 'application/json' });
  const done = () => {
    S.prefs.lastBackup = today();
    save();
    render();
  };

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      done();
      toast('Backup esportato');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  done();
  toast('Backup scaricato');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const data = normalize(JSON.parse(await f.text()));
      const when = data.prefs?.lastBackup ? ` del ${longDate(data.prefs.lastBackup)}` : '';
      if (!confirm(`Sostituire i dati attuali con il backup${when}? (${data.tx.length} movimenti)`)) return;
      S = data;
      runRecurring();
      save();
      render();
      toast('Backup ripristinato');
    } catch (e) {
      toast('File di backup non valido');
    }
  };
  input.click();
}

function resetAll() {
  if (!confirm('Cancellare tutti i conti, i movimenti e le ricorrenze?')) return;
  if (!confirm('Sei sicuro? L’operazione non si può annullare.')) return;
  S = fresh();
  save();
  month = curMonth();
  render();
  toast('Dati cancellati');
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------------- eventi ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'tab': setView(id); break;
    case 'add': openTx(null); break;
    case 'close': closeSheet(); break;
    case 'acc': openAccount(id); break;
    case 'new-acc': openAccount(null); break;
    case 'tx': openTx(S.tx.find((t) => t.id === id)); break;
    case 'rec': openRule(id); break;
    case 'new-rec': openTx(null, { repeat: true }); break;
    case 'month': month = addMonths(month, Number(id)); render(); break;
    case 'goto-month': month = id; render(); break;
    case 'filter': filter = id; render(); break;
    case 'go-mov': month = curMonth(); setView('movimenti'); break;
    case 'del-cat': {
      const k = el.dataset.kind;
      S.cats[k] = S.cats[k].filter((c) => c !== id);
      save();
      render();
      break;
    }
    case 'export': exportData(); break;
    case 'import': importData(); break;
    case 'reset': resetAll(); break;
  }
});

// quando riapri l'app: genera le ricorrenze scadute e aggiorna le date ("Oggi", "Ieri")
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  runRecurring();
  render();
});

/* ---------------- avvio ---------------- */
runRecurring();
render();

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
