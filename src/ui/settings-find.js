'use strict';

// Settings window: the Custom search page (an item to start from, the stats to search for), stat
// weights and testing an item. The build-weighted searches are per slot on My gear (settings.js).

// ---------- Find upgrade tab ----------

let tradeInfo = null;
let findRows = []; // { key, current, keep, min, max }

let rowsEdited = false;
let recent = [];
const toTarget = (v) => (v && v.startsWith('item:') ? { itemId: v.slice(5) } : v);
const fromTarget = (t) => (t && typeof t === 'object' && t.itemId ? 'item:' + t.itemId : t);

function showTab(name) {
  // switch tabs without firing the tab button's click handler
  document.querySelectorAll('.tabs button').forEach((x) => { const on = x.dataset.tab === name; x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
}

async function ensureTradeInfo(force) {
  // leagues and stats are each game's own: never reuse the other game's
  if (tradeInfo && !force && tradeInfo.forGame === (state && state.game)) return tradeInfo;
  $('#findMsg').textContent = 'Loading trade site data…';
  const forGame = state && state.game;
  tradeInfo = await window.api.tradeData(!!force);
  if (tradeInfo) tradeInfo.forGame = forGame;
  if (!tradeInfo.ok) {
    // a plain reason, without the API address the error carries
    const why = String(tradeInfo.error || '').replace(/\s+(from|at)\s+https?:\/\/\S+/i, '').trim();
    $('#findMsg').textContent = `Couldn't reach the trade site${why ? ` (${why})` : ''}. Press the reload button next to League to try again.`;
    const failed = tradeInfo; tradeInfo = null; // try again next time
    return failed;
  }
  $('#findMsg').textContent = '';
  const saved = state && state.settings.league;
  const leagues = tradeInfo.leagues.length ? tradeInfo.leagues : ['Standard'];
  $('#findLeague').innerHTML = leagues.map((l) => `<option ${l === saved ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#tradeStats').innerHTML = tradeInfo.statTexts.map((t) => `<option value="${esc(t)}">`).join('');
  return tradeInfo;
}

async function fillFindSlots(selected) {
  // the same item copied several times shows once (the newest copy)
  const all = await window.api.recentItems();
  const texts = await Promise.all(all.map(async (r) => {
    if (r.text != null) return r.text;
    try { const f = await window.api.findRows({ itemId: r.id }); return f && f.item ? (f.item.lines || []).map((l) => l.text).join('\n') : ''; } catch (_) { return ''; }
  }));
  const seen = new Set();
  recent = all.filter((r, i) => { const k = `${r.name}|${r.itemClass}|${texts[i]}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const eq = state.slots.filter((s) => state.equipped[s])
    .map((s) => `<option value="${esc(s)}">${esc(s)}: ${esc(state.equipped[s].name)}</option>`);
  const cp = recent.map((r, i) => `<option value="item:${esc(r.id)}">${i === 0 ? 'Just copied: ' : ''}${esc(r.name)} (${esc(r.itemClass)})</option>`);
  $('#findSlot').innerHTML = (eq.length ? `<optgroup label="Your gear">${eq.join('')}</optgroup>` : '')
    + (cp.length ? `<optgroup label="Copied in game">${cp.join('')}</optgroup>` : '')
    || '<option value="">Nothing saved or copied yet</option>';
  let want = fromTarget(selected);
  if (want === '__last') want = recent[0] ? 'item:' + recent[0].id : '';
  if (want && [...$('#findSlot').options].some((o) => o.value === want)) $('#findSlot').value = want;
  syncFindActions();
}
// the search needs an item (it sets the trade site's item type): with nothing saved or copied it's greyed out
function syncFindActions() {
  const none = !$('#findSlot').value;
  $('#findSearch').disabled = none;
  $('#findSearch').title = none ? 'Needs an item: save your gear on My gear, or copy one in game.' : '';
  renderUses();
}
// what the search also uses, from Trade search settings on My gear
function renderUses() {
  const el = $('#csUses'); if (!el || !state) return;
  const b = state.settings.budget;
  const cur = b ? ({ divine: 'div', exalted: 'ex', chaos: 'chaos' }[b.currency] || '') : '';
  const price = !b ? 'any price' : b.min != null && b.max != null ? `${b.min}–${b.max} ${cur}` : b.max != null ? `up to ${b.max} ${cur}` : `from ${b.min} ${cur}`;
  const lv = state.settings.leveling && state.settings.leveling.on ? ` · level ${state.settings.leveling.level} or lower` : '';
  const sellers = ($('#findStatus') && $('#findStatus').selectedOptions[0]) ? $('#findStatus').selectedOptions[0].textContent : '';
  el.innerHTML = `Also uses your trade search settings: <b>${esc(price)}</b> · ${esc(sellers)} · ${esc(($('#findLeague') && $('#findLeague').value) || state.settings.league || '')}${esc(lv)}${state.settings.noCorrupted ? ' · no corrupted' : ''} <button class="link" data-goto="gear">change</button>`;
  const g = el.querySelector('[data-goto]');
  if (g) g.addEventListener('click', () => document.querySelector('.tabs button[data-tab="gear"]').click());
}

let findSeq = 0; // a newer pick (or another character) wins over a slower answer for the one before
async function buildFindRows() {
  const seq = ++findSeq;
  const { item: it, rows } = await window.api.findRows(toTarget($('#findSlot').value));
  if (seq !== findSeq) return;
  rowsEdited = false;
  $('#findNotice').textContent = '';
  if (!it) {
    $('#findItem').textContent = 'No item here yet. Save your equipped gear first (My gear page), or copy an item in game.';
    findRows = [];
  } else {
    $('#findItem').innerHTML = `<b>${esc(it.name)}</b> ${esc(it.baseType !== it.name ? it.baseType : '')} <span class="dim">(${esc(it.itemClass)}${it.rarity ? ', ' + esc(it.rarity) : ''})</span>`;
    const scale = Number($('#minScale').value) || 1;
    findRows = rows.map((x) => ({
      key: x.key, source: x.source, current: x.value,
      // runes/enchants are unticked: a buyer can socket those themselves
      ignored: isIgnoredKey(x.key),
      keep: x.source !== 'socket' && !isIgnoredKey(x.key) && !/Runic Ward|Attacks per Second|Critical Hit/.test(x.key),
      min: scaledMin(x.key, x.value, scale), max: '',
    }));
    const order = { base: 0, mod: 1, implicit: 2, socket: 3 };
    findRows.sort((a, b) => (order[a.source] - order[b.source]) || a.key.localeCompare(b.key));
  }
  renderFindRows();
}

function scaledMin(key, value, scale) {
  if (value == null || value === '') return '';
  const f = key.startsWith('[') ? 0.9 * scale : scale;
  const v = value * f;
  if (value < 0) return Math.round(v * 100) / 100;
  if (value >= 1 && v < 1) return 1;
  return value >= 3 ? Math.floor(v) : Math.round(v * 100) / 100;
}

function renderFindRows() {
  $('#findStats').innerHTML = '<tr><th>Keep</th><th>Stat</th><th>Yours</th><th>Min</th><th>Max</th></tr>' + findRows.map((r, i) => `
    <tr>
      <td><input type="checkbox" data-i="${i}" data-f="keep" ${r.keep ? 'checked' : ''}></td>
      <td title="${esc(r.key)}">${esc(window.statName ? window.statName(r.key) + (/#%/.test(r.key) ? " (%)" : "") : niceKey(r.key))}${r.current == null ? ` <span class="dim">(added${r.idType ? ', ' + esc({ pseudo: 'total', augment: 'rune' }[r.idType] || r.idType) : ''})</span>` : r.ignored ? ' <span class="dim">(ignored)</span>' : r.source === 'socket' ? ' <span class="dim">(rune)</span>' : r.source === 'implicit' ? ' <span class="dim">(implicit)</span>' : ''}</td>
      <td class="dim">${r.current == null ? '' : esc(r.current)}</td>
      <td><input type="number" data-i="${i}" data-f="min" value="${esc(r.min)}"></td>
      <td><input type="number" data-i="${i}" data-f="max" value="${esc(r.max)}"></td>
    </tr>`).join('');
  document.querySelectorAll('#findStats input').forEach((inp) => inp.addEventListener('change', () => {
    const r = findRows[Number(inp.dataset.i)];
    rowsEdited = true;
    if (inp.dataset.f === 'keep') r.keep = inp.checked; else r[inp.dataset.f] = inp.value;
  }));
}

// another character or game: the page's item and stat rows were the last one's, so they're read again
// (only when the page is open: opening it reads them anyway)
async function refreshFindForCharacter() {
  if (!($('#tab-find') && $('#tab-find').classList.contains('active'))) return;
  try { await ensureTradeInfo(false); await fillFindSlots($('#findSlot').value); await buildFindRows(); } catch (_) { /* shown on the page */ }
}

async function openFind(target) {
  showTab('find');
  state = await window.api.getState();
  await ensureTradeInfo(false);
  $('#findStatus').value = state.settings.status || 'available';
  await fillFindSlots(target || $('#findSlot').value || (state.slots.find((s) => state.equipped[s])) || '__last');
  await buildFindRows();
}

function searchExtra() {
  return { league: $('#findLeague').value || undefined, status: $('#findStatus').value };
}

$('#findSlot').addEventListener('change', buildFindRows);
$('#minScale').addEventListener('change', () => {
  const scale = Number($('#minScale').value) || 1;
  findRows.forEach((r) => { if (r.current != null) r.min = scaledMin(r.key, r.current, scale); });
  renderFindRows();
});
$('#tickAll').addEventListener('click', () => { findRows.forEach((r) => { r.keep = true; }); rowsEdited = true; renderFindRows(); });
$('#tickNone').addEventListener('click', () => { findRows.forEach((r) => { r.keep = false; }); rowsEdited = true; renderFindRows(); });
$('#tradeRefresh').addEventListener('click', async () => { await ensureTradeInfo(true); });
$('#addTradeBtn').addEventListener('click', () => {
  const key = $('#addTradeStat').value.trim();
  if (!key) return;
  findRows.push({ key, current: null, keep: true, min: $('#addTradeMin').value, max: '' });
  rowsEdited = true;
  $('#addTradeStat').value = ''; $('#addTradeMin').value = '';
  renderFindRows();
});
async function runFind(fn, msgSel) {
  const msg = $(msgSel || '#findMsg');
  await window.api.setSetting('budget', readBudget());
  $('#findMsg').textContent = ''; $('#findMsg2').textContent = '';
  msg.textContent = 'Searching the trade site…';
  const btns = [...document.querySelectorAll('#findSearch')];
  btns.forEach((b) => { b.disabled = true; });
  let res;
  try { res = await fn(); } catch (err) { res = { ok: false, error: (err && err.message) || String(err) }; } finally {
    btns.forEach((b) => { b.disabled = false; });
    syncFindActions();
  }
  window.showSearchResult(msg, res);
}
$('#findSearch').addEventListener('click', () => runFind(() => {
  const picks = findRows.filter((r) => r.keep).map((r) => ({ key: r.key, min: r.min, max: r.max, source: r.source, id: r.id, idType: r.idType }));
  if (!picks.length) return Promise.resolve({ ok: false, error: 'Tick at least one stat first.' });
  return window.api.tradeSearch({
    target: toTarget($('#findSlot').value), picks, budget: readBudget(),
    matchBase: $('#findSameBase').checked, ...searchExtra(),
  });
}, '#findMsg2'));
$('#findStatus').addEventListener('change', () => window.api.setSetting('status', $('#findStatus').value));
$('#findLeague').addEventListener('change', () => window.api.setSetting('league', $('#findLeague').value));
document.querySelector('.tabs button[data-tab="find"]').addEventListener('click', () => openFind(null));
window.api.onFindUpgrade((target) => { load().then(() => openFind(target)); });

// A new item was copied: keep the Find tab in step with it.
window.api.onItemCopied(async (info) => {
  const wasLatest = !$('#findSlot').value || (recent[0] && $('#findSlot').value === 'item:' + recent[0].id);
  state = await window.api.getState();
  const keepSel = $('#findSlot').value;
  await fillFindSlots(wasLatest && !rowsEdited ? { itemId: info.id } : keepSel);
  if (!document.querySelector('#tab-find').classList.contains('active')) return;
  if (wasLatest && !rowsEdited) { await buildFindRows(); return; }
  $('#findNotice').innerHTML = `You just copied <b>${esc(info.name)}</b> in game; this page still shows the item you picked. `;
  const b = document.createElement('button');
  b.className = 'link'; b.textContent = `Switch to ${info.name}`;
  b.addEventListener('click', async () => { $('#findSlot').value = 'item:' + info.id; await buildFindRows(); });
  $('#findNotice').appendChild(b);
});

function renderWeights() {
  // the page redraws whenever a setting changes (including the weight you just typed): the box you
  // were in (Tab took you to the next one) keeps focus and what you'd typed so far
  const fe = document.activeElement;
  const focusKey = fe && fe.closest && fe.closest('#weights') && fe.dataset ? fe.dataset.key : null;
  const focusVal = focusKey != null ? fe.value : null;
  const filter = $('#filter').value.trim().toLowerCase();
  const only = $('#onlyWeighted').checked;
  const keys = Array.from(new Set([...Object.keys(state.weights), ...state.seenStats]));
  keys.sort((a, b) => (state.weights[b] ? 1 : 0) - (state.weights[a] ? 1 : 0) || a.localeCompare(b));
  const rows = keys
    .filter((k) => !filter || k.toLowerCase().includes(filter))
    .filter((k) => !only || state.weights[k])
    .filter((k) => !(state.game === 'poe1' && /\bSpirit\b/.test(k))) // no Spirit in PoE1
    .map((k) => `<tr><td title="${esc(k)}">${esc(niceKey(k))}</td><td><input type="number" step="0.1" data-key="${esc(k)}" value="${state.weights[k] || ''}" placeholder="0"></td></tr>`)
    .join('');
  $('#weights').innerHTML = '<tr><th>Stat (# = the number)</th><th>Weight</th></tr>' + (rows || '<tr><td colspan="2" class="dim">No stats match.</td></tr>');
  document.querySelectorAll('#weights input').forEach((inp) => inp.addEventListener('change', async () => {
    await window.api.setWeight(inp.dataset.key, inp.value);
    state = await window.api.getState();
    $('#weightsJson').value = JSON.stringify(state.weights, null, 2);
  }));
  if (focusKey != null) {
    const back = [...document.querySelectorAll('#weights input')].find((x) => x.dataset.key === focusKey);
    if (back) { back.value = focusVal; back.focus(); }
  }
}

$('#filter').addEventListener('input', renderWeights);
$('#onlyWeighted').addEventListener('change', renderWeights);
$('#resetWeights').addEventListener('click', async () => { await window.api.resetWeights(); load(); });
$('#addStat').addEventListener('click', async () => {
  const key = ($('#filter').value || '').trim();
  if (!key) { $('#filter').placeholder = 'Type the stat here first, e.g. #% increased Spell Damage'; $('#filter').focus(); return; }
  await window.api.setWeight(key, 1);
  load();
});
$('#exportW').addEventListener('click', () => { $('#weightsJson').value = JSON.stringify(state.weights, null, 2); });
$('#importW').addEventListener('click', async () => {
  try {
    const obj = JSON.parse($('#weightsJson').value);
    await window.api.replaceWeights(obj);
    $('#importMsg').textContent = 'Imported.';
    load();
  } catch (e) { $('#importMsg').textContent = 'That isn\'t valid JSON.'; }
});

$('#testBtn').addEventListener('click', async () => {
  const text = $('#testText').value;
  if (state && state.pobOn) $('#testResult').innerHTML = '<div class="card"><div class="note"><span class="spinner"></span> Checking with Path of Building…</div></div>';
  const r = await window.api.evaluateText(text);
  window.renderComparison($('#testResult'), r, { itemText: text, onChange: () => { load(); $('#testBtn').click(); } });
});

$('#autoHide').addEventListener('change', () => window.api.setSetting('autoHideSeconds', Math.max(2, Number($('#autoHide').value) || 12)));
$('#paused').addEventListener('change', () => window.api.setSetting('paused', $('#paused').checked));

window.api.onChanged(load);
