'use strict';

// Settings window: shared helpers, the tabs, loading the app's state and the My gear page.
// The window's other pages are in settings-*.js (loaded in order, sharing these globals), then
// character.js, spend.js and picker.js.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = null;

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => { x.classList.toggle('active', x === b); if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
}));

let accountAt = 0; // when the sign-in status was last checked
// words that differ between the games: <span class="p2">…</span><span class="p1">…</span> in the page,
// and a few attributes set here
// a stat as the game writes it: "# to maximum Life" -> "… to maximum Life", without the app's internal tags
const niceKey = (k) => String(k || '').replace(/^\[(Base|Weapon)\]\s*/, '').replace(/\s*\(Local\)\s*$/i, '').replace(/#/g, '…');
function gameWords() {
  const p1 = state && state.game === 'poe1';
  document.body.classList.toggle('game-poe1', p1);
  const ps = $('#pickerSearch'); if (ps) ps.placeholder = p1 ? 'Search stats, e.g. energy shield, minion, reservation, cast speed…' : 'Search stats, e.g. energy shield, minion, spirit, cast speed…';
  const fs = $('#findSimilar'); if (fs) fs.title = `Listings with this item's stats at its values or higher. If nothing is listed it loosens step by step (90%, 80%, 65%) and tells you.${p1 ? '' : ' Rune bonuses are left out – you can socket your own.'}`;
  const rb = $('#resBuffer'); if (rb && rb.parentElement) rb.parentElement.title = `How far over the cap a resistance must be before more of it stops counting. PoB numbers can include ${p1 ? 'flasks' : 'charms'} and buffs that aren't always on.`;
  const aug = document.querySelector('option[value="augment"]'); if (aug) aug.textContent = p1 ? 'Enchant / other' : 'Rune';
}
let foldedFor = null; // the Path of Building state the folds were last set for (a click you make stays)
async function load() {
  state = await window.api.getState();
  gameWords();
  renderSlots();
  renderWeights();
  $('#weightsJson').value = JSON.stringify(state.weights, null, 2);
  $('#autoHide').value = state.settings.autoHideSeconds;
  $('#paused').checked = !!state.settings.paused;
  loadBudget();
  renderIgnore();
  renderSaved();
  renderHistory();
  window.renderProfilePicker($('#gsPicker'));
  // trade leagues and the Divine rate are shown on My gear (Trade search settings): load them once per game
  if (window.__tradeFor !== state.game) { window.__tradeFor = state.game; ensureTradeInfo(false).catch(() => {}); showRate(false); }
  if (document.activeElement !== $('#findStatus')) $('#findStatus').value = state.settings.status || 'available';
  $('#popupPosition').value = state.settings.popupPosition || 'cursor';
  $('#uiScale').value = String(state.settings.uiScale || 1);
  $('#popupDetail').value = state.settings.popupDetail || 'compact';
  $('#colorblind').checked = !!state.settings.colorblind;
  document.body.classList.toggle('cb', !!state.settings.colorblind);
  if (document.activeElement !== $('#resultsHotkey')) $('#resultsHotkey').value = state.settings.resultsHotkey || 'Ctrl+Shift+D';
  renderSetup();
  renderProfiles();
  renderResists();
  renderBuildEditor();
  $('#startWithWindows').checked = !!state.settings.startWithWindows;
  if (state.platform === 'linux') { $('#startWithLabel').textContent = 'Start when I log in'; if (state.dataDir) $('#dataDirText').textContent = state.dataDir; }
  $('#openSettingsOnStart').checked = state.settings.openSettingsOnStart !== false;
  $('#advancedCopy').checked = !!state.settings.advancedCopy;
  $('#watchClipboard').checked = state.settings.watchClipboard !== false;
  $('#autoUpdateGear').checked = state.settings.autoUpdateGear !== false;
  const hs = state.hotkeyStatus || {};
  if (document.activeElement !== $('#hotkey')) $('#hotkey').value = state.settings.hotkey || 'F2';
  if (document.activeElement !== $('#priceHotkey')) $('#priceHotkey').value = priceKeyNow() || '';
  if (document.activeElement !== $('#equipHotkey')) $('#equipHotkey').value = state.settings.equipHotkey || '';
  if (document.activeElement !== $('#stringsHotkey')) $('#stringsHotkey').value = state.settings.stringsHotkey || '';
  if (document.activeElement !== $('#filterHotkey')) $('#filterHotkey').value = state.settings.filterHotkey || '';
  if (document.activeElement !== $('#regexHotkey')) $('#regexHotkey').value = state.settings.regexHotkey || '';
  if (typeof syncHotkeyButtons === 'function') syncHotkeyButtons();
  // working: the box already shows the key; only a problem needs saying
  if (!hs.ok) $('#hotkeyMsg').textContent = hs.error || 'Hotkey not registered.';
  else if (!/^(Saved|Click Save|Use a modifier)/.test($('#hotkeyMsg').textContent)) $('#hotkeyMsg').textContent = '';
  $('#hotkeyLine').innerHTML = hs.ok
    ? `In game: hover an item and press <b>${esc(hs.accelerator)}</b>${priceKeyNow() ? ` (<b>${esc(priceKeyNow())}</b> for just its price)` : ''}.<br>You can close this window; the app keeps running in the tray.`
    : `<span class="note">Hotkey isn't working: ${esc(hs.error || 'not registered')} – change it in Settings.</span>`;
  renderPob(false);
  if (Date.now() - accountAt > 30000) renderAccount(); // not on every change: it asks the trade site
  renderModeHints();
  const hp = $('#hotkeyProblems');
  if (hp) {
    const probs = state.hotkeyProblems || [];
    hp.classList.toggle('hidden', !probs.length);
    hp.innerHTML = probs.length ? `${window.ICON.warn} ${probs.length === 1 ? 'This hotkey doesn\'t work' : 'These hotkeys don\'t work'}: ${probs.map((x) => `<b>${esc(x.what)}</b> (${esc(x.key)})`).join(', ')}. Another program (often another overlay) already uses ${probs.length === 1 ? 'it' : 'them'}. <button class="link" id="hkFix">Pick other keys</button>` : '';
    const fix = hp.querySelector('#hkFix');
    if (fix) fix.addEventListener('click', () => showTab('options'));
  }
  const le = $('#loadError');
  if (le) { le.classList.toggle('hidden', !state.loadError); if (state.loadError) le.textContent = `Your settings file couldn't be read (${state.loadError}), so the app started with defaults. The old file was kept next to it as poe2-upgrade-checker.json.unreadable-…`; }
}

function summary(item) {
  const top = (item.lines || []).filter((l) => l.key).slice(0, 4).map((l) => l.text).join(' · ');
  return top;
}

function renderGearSummary() {
  const gs = state.gearScores || {};
  const main = state.mainSlots || [];
  const rated = Object.entries(gs).filter(([slot, g]) => g && g.score != null && (!main.length || main.includes(slot)));
  if (!rated.length || state.settings.build === 'off') { $('#gearSummary').innerHTML = ''; return; }
  const avg = Math.round(rated.reduce((a, [, g]) => a + g.score, 0) / rated.length);
  const grade = avg >= 85 ? 'S' : avg >= 70 ? 'A' : avg >= 55 ? 'B' : avg >= 40 ? 'C' : 'D';
  const weakest = rated.slice().sort((a, b) => a[1].score - b[1].score).slice(0, 3);
  const build = state.buildNow;
  $('#gearSummary').innerHTML = `<div class="gear"><span class="gs g-${grade}">${avg} ${grade}</span> <b>Overall gear score</b> <span class="dim">for ${esc(build && build.name ? build.name : 'your build')}${state.pobOn ? ' – a rough guide; verdicts come from Path of Building' : ''}</span></div>
    <div>Upgrade first: ${weakest.map(([slot, g]) => `<button class="link" data-quick2="${esc(slot)}">${esc(slot)} (${g.score})</button>`).join(' · ')}
    <span class="note" id="gearSumMsg"></span></div>`;
  document.querySelectorAll('[data-quick2]').forEach((b) => b.addEventListener('click', async () => {
    $('#gearSumMsg').textContent = ` Searching upgrades for ${b.dataset.quick2}…`;
    window.showSearchResult($('#gearSumMsg'), await window.api.quickFind(b.dataset.quick2, 'upgrade').catch((err) => ({ ok: false, error: (err && err.message) || String(err) })));
  }));
}

function renderSlots() {
  renderGearSummary();
  const gs = state.gearScores || {};
  const main = state.mainSlots || state.slots;
  // jewel slots: the first 6, any that hold a jewel and one empty one after them (a build can have many)
  let lastJewel = 0;
  state.slots.forEach((s) => { const m = /^Jewel (\d+)$/.exec(s); if (m && state.equipped[s]) lastJewel = Math.max(lastJewel, Number(m[1])); });
  const extras = state.slots.filter((s) => !main.includes(s)).filter((s) => { const m = /^Jewel (\d+)$/.exec(s); return !m || Number(m[1]) <= Math.max(6, lastJewel + 1); });
  const showExtras = extras.filter((s) => state.equipped[s]);
  const extraOpen = window.__extraOpen != null ? window.__extraOpen : showExtras.length > 0;
  const row = (s) => {
    const it = state.equipped[s];
    const g = gs[s];
    const gcell = !it ? '' : !g ? '' : g.score == null ? `<span class="dim">${g.unique ? 'unique' : g.unrated === 'unidentified' ? 'unidentified' : 'not rated'}</span>`
      : `<span class="gs g-${esc(g.grade)}" title="${esc((g.missing || []).length ? 'Missing: ' + g.missing.join(', ') : '')}">${g.score} ${esc(g.grade)}</span>`;
    return `<tr class="slotrow"><td>${esc(s)}</td><td>${gcell}</td>
      <td class="item-cell">${it ? `<b class="rar-${esc(String(it.rarity || '').toLowerCase())}">${esc(it.name)}</b> <span class="dim">${esc(it.baseType !== it.name ? it.baseType : '')}</span>${it.fromPob ? ' <span class="dim small">· from PoB</span>' : ''}<div class="dim mods-line" title="${esc(summary(it))}">${esc(summary(it).replace(/\(-?\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, ''))}</div>`
        : '<span class="empty">not set</span>'}</td>
      <td class="slot-actions">${it ? slotActions(s, it) : ''}</td></tr>
      <tr class="slot-out hidden" data-out="${esc(s)}"><td colspan="4"></td></tr>`;
  };
  $('#slots').innerHTML = `<tr><th>Slot</th><th>${state.game === 'poe1' ? '' : 'Gear score'}</th><th>Item</th><th></th></tr>` + main.map(row).join('')
    + `<tr><td colspan="4"><button class="link" id="extraToggle">${extraOpen ? '▾' : '▸'} ${state && state.game === 'poe1' ? 'Weapon swap, flasks &amp; jewels' : 'Weapon swap, flasks, charms &amp; jewels'} (${showExtras.length} saved)</button></td></tr>`
    + (extraOpen ? extras.map(row).join('') : '')
    + '<tr><td colspan="4" class="note" id="gearMsg"></td></tr>';
  $('#extraToggle').addEventListener('click', () => { window.__extraOpen = !extraOpen; renderSlots(); });
  bindSlotActions();
}

// Each slot's searches: Find upgrades (weighted by your build) up front, the rest in a More menu.
// They all use the Trade search settings at the top of the page (price, sellers, league, filters).
function slotActions(s, it) {
  const gear = true; // every slot the app saves can be searched (as before)
  const e = esc(s);
  const byWeights = state.settings.build === 'off' && !state.pobOn;
  const unique = String(it.rarity || '').toLowerCase() === 'unique';
  const items = [
    gear ? `<button data-act="similar" data-slot="${e}" title="Listings with this item's stats at its values or higher. Loosens to 90%, 80%, 65% if nothing is listed.">Same stats or better</button>` : '',
    gear && byWeights ? `<button data-act="weights" data-slot="${e}" title="Anything that scores higher with your own stat weights">By my weights</button>` : '',
    gear && !unique ? `<button data-act="craft" data-slot="${e}" title="Rare bases with this slot's key stats and an open prefix and suffix">Craftable bases</button>` : '',
    gear && !/^Jewel/.test(s) && state.pobOn ? `<button data-act="uniques" data-slot="${e}" title="Every unique that fits this slot, tried in your Path of Building build">Best uniques</button>` : '',
    `<button data-act="price" data-slot="${e}" title="What this item would sell for">What's it worth?</button>`,
    `<button data-act="custom" data-slot="${e}" title="Open Custom search with this item's stats filled in (not weighted by your build)">Custom search…</button>`,
    `<hr><button data-act="clear" data-slot="${e}" class="danger-text" title="Forget the item saved for this slot">Clear slot</button>`,
  ].filter(Boolean).join('');
  return `<div class="slot-btns">${gear ? `<button class="primary" data-act="upgrade" data-slot="${e}" title="${state.pobOn ? 'Path of Building weights the search by what each stat does to your build, then checks every listing in your build' : 'Listings that score higher for your build (gear score)'}">Find upgrades</button>` : ''}
    <details class="slot-more"><summary title="More searches for this slot">More</summary><div class="slot-menu">${items}</div></details></div>`;
}
function slotOut(slot) {
  const tr = document.querySelector(`.slot-out[data-out="${CSS.escape(slot)}"]`);
  document.querySelectorAll('.slot-out').forEach((x) => { if (x !== tr) { x.classList.add('hidden'); x.firstElementChild.innerHTML = ''; } });
  if (!tr) return null;
  tr.classList.remove('hidden');
  return tr.firstElementChild;
}
function searchExtraGear() {
  return { league: ($('#findLeague') && $('#findLeague').value) || undefined, status: $('#findStatus').value };
}
let slotBusy = false;
async function runSlotAction(act, slot, btn) {
  if (act === 'custom') { openFind(slot); return; }
  if (act === 'clear') {
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Click again to clear'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Clear slot'; } }, 4000); return; }
    await window.api.clearSlot(slot); load(); return;
  }
  if (slotBusy) return;
  const out = slotOut(slot);
  if (!out) return;
  if (act === 'uniques') { window.showBestUniques(slot, out); return; }
  const label = { upgrade: 'Find upgrades', similar: 'Same stats or better', weights: 'By my weights', craft: 'Craftable bases', price: "What's it worth?" }[act];
  out.innerHTML = `<div class="slot-res"><span class="slot-res-k">${esc(label)}</span><span class="note slot-msg"><span class="spinner"></span> Searching the trade site…</span></div>`;
  const msg = out.querySelector('.slot-msg');
  slotBusy = true;
  document.querySelectorAll('[data-act]').forEach((x) => { if (x.dataset.act !== 'custom') x.disabled = true; });
  let res;
  try {
    await window.api.setSetting('budget', readBudget());
    res = act === 'price' ? await window.api.priceCheck(slot) : await window.api.quickFind(slot, act, searchExtraGear());
  } catch (err) { res = { ok: false, error: (err && err.message) || String(err) }; } finally {
    slotBusy = false;
    document.querySelectorAll('[data-act]').forEach((x) => { x.disabled = false; });
  }
  window.showSearchResult(msg, res);
}
function bindSlotActions() {
  // the full mods of an item: click its line
  document.querySelectorAll('.mods-line').forEach((m) => m.addEventListener('click', () => m.classList.toggle('open')));
  document.querySelectorAll('#slots [data-act]').forEach((b) => b.addEventListener('click', () => {
    const menu = b.closest('details'); if (menu && b.dataset.act !== 'clear') menu.open = false;
    runSlotAction(b.dataset.act, b.dataset.slot, b);
  }));
  // one More menu open at a time
  document.querySelectorAll('#slots details.slot-more').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) document.querySelectorAll('#slots details.slot-more[open]').forEach((o) => { if (o !== d) o.open = false; });
  }));
}
document.addEventListener('click', (e) => {
  if (!e.target.closest || e.target.closest('details.slot-more')) return;
  document.querySelectorAll('details.slot-more[open]').forEach((o) => { o.open = false; });
});

// Discord community (sidebar and Settings → Startup & updates): opens poe2upgrade.com/discord in the browser
document.querySelectorAll('[data-discord]').forEach((b) => b.addEventListener('click', () => window.api.openUrl('https://poe2upgrade.com/discord')));
// Support the project (Settings → Startup & updates): opens the Ko-fi page in the browser
document.querySelectorAll('[data-kofi]').forEach((b) => b.addEventListener('click', () => window.api.openUrl('https://ko-fi.com/akwhitesoftware')));
