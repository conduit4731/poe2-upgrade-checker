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
  $('#appScale').value = String(state.settings.appScale == null ? 'auto' : state.settings.appScale);
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
  $('#gearSummary').innerHTML = `<div class="gsum">
      <div class="gsum-score"><span class="gs big g-${grade}">${avg}<small>${grade}</small></span><div><b>Overall gear score</b><div class="dim small">for ${esc(build && build.name ? build.name : 'your build')}${state.pobOn ? ' · a rough guide, verdicts come from Path of Building' : ''}</div></div></div>
      <div class="gsum-weak"><span class="gsum-k">Weakest slots</span>${weakest.map(([slot, g]) => `<button class="chip-btn" data-quick2="${esc(slot)}" title="Find upgrades for ${esc(slot)}"><span>${esc(slot)}</span><span class="gs g-${esc(g.grade)}">${g.score}</span></button>`).join('')}</div>
    </div><div class="note" id="gearSumMsg"></div>`;
  document.querySelectorAll('[data-quick2]').forEach((b) => b.addEventListener('click', async () => {
    $('#gearSumMsg').textContent = ` Searching upgrades for ${b.dataset.quick2}…`;
    window.showSearchResult($('#gearSumMsg'), await window.api.quickFind(b.dataset.quick2, 'upgrade').catch((err) => ({ ok: false, error: (err && err.message) || String(err) })));
  }));
}

// My gear's equipment as a list (one row per slot, the default) or a grid of cards; kept in this
// window's storage, as it's only how you like to look at it
function gearView() {
  try { return localStorage.getItem('gearView') === 'grid' ? 'grid' : 'list'; } catch (_) { return 'list'; }
}
document.querySelectorAll('.view-switch [data-view]').forEach((b) => b.addEventListener('click', () => {
  try { localStorage.setItem('gearView', b.dataset.view); } catch (_) { /* the default then */ }
  renderSlots();
}));

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
  // one card per slot: the slot and its score, the item in its rarity colour with its first mods, the searches
  const MODS = 3;
  const card = (s) => {
    const it = state.equipped[s];
    const g = gs[s];
    if (!it) {
      return `<div class="slot-card is-empty"><div class="sc-head"><span class="sc-slot">${esc(s)}</span><span class="sc-note"></span></div>
        <div class="sc-empty">Not saved. In game, hover it, press <b>${esc((state.hotkeyStatus && state.hotkeyStatus.accelerator) || state.settings.hotkey || 'F2')}</b> and click <b>Set as …</b></div></div>`;
    }
    const rar = String(it.rarity || 'normal').toLowerCase();
    const score = !g ? '<span class="sc-note"></span>' : g.score == null ? `<span class="sc-note">${g.unique ? 'unique' : g.unrated === 'unidentified' ? 'unidentified' : 'not rated'}</span>`
      : `<span class="gs g-${esc(g.grade)}" title="Gear score${(g.missing || []).length ? ' · missing: ' + esc(g.missing.join(', ')) : ''}">${g.score}<small>${esc(g.grade)}</small></span>`;
    const mods = (it.lines || []).filter((l) => l.key).map((l) => String(l.text).replace(/\(-?\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, ''));
    return `<div class="slot-card r-${esc(rar)}" data-card="${esc(s)}">
      <div class="sc-head"><span class="sc-slot">${esc(s)}</span>${score}</div>
      <div class="sc-item">
        <div class="sc-name rar-${esc(rar)}">${esc(it.name)}</div>
        <div class="sc-base">${esc(it.baseType !== it.name ? it.baseType : it.itemClass || '')}${it.fromPob ? ' <span class="sc-tag">from PoB</span>' : ''}</div>
        ${mods.length ? `<ul class="sc-mods">${mods.map((m, i) => `<li${i >= MODS ? ' class="more"' : ''}>${esc(m)}</li>`).join('')}</ul>${mods.length > MODS ? `<button class="link sc-allmods">+${mods.length - MODS} more</button>` : ''}` : ''}
      </div>
      <div class="sc-actions">${slotActions(s, it)}</div>
      <div class="slot-out hidden" data-out="${esc(s)}"></div>
    </div>`;
  };
  const view = gearView();
  document.querySelectorAll('.view-switch [data-view]').forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const cls = `slot-grid${view === 'list' ? ' as-list' : ''}`;
  const head = view === 'list' ? `<div class="list-head"><span>Slot</span><span>${state.game === 'poe1' ? '' : 'Score'}</span><span>Item</span><span></span></div>` : '';
  $('#slots').innerHTML = `<div class="${cls}">${head}${main.map(card).join('')}</div>
    <button class="link extra-toggle" id="extraToggle">${extraOpen ? '▾' : '▸'} ${state && state.game === 'poe1' ? 'Weapon swap, flasks &amp; jewels' : 'Weapon swap, flasks, charms &amp; jewels'} <span class="dim">(${showExtras.length} saved)</span></button>
    ${extraOpen ? `<div class="${cls} extras">${extras.map(card).join('')}</div>` : ''}
    <div class="note" id="gearMsg"></div>`;
  $('#extraToggle').addEventListener('click', () => { window.__extraOpen = !extraOpen; renderSlots(); });
  // list view: click an item's mod line to see all its mods
  document.querySelectorAll('.as-list .sc-mods').forEach((m) => m.addEventListener('click', () => m.closest('.slot-card').classList.toggle('mods-open')));
  document.querySelectorAll('.sc-allmods').forEach((b) => b.addEventListener('click', () => {
    const c = b.closest('.slot-card'); const open = c.classList.toggle('mods-open');
    b.textContent = open ? 'fewer' : `+${c.querySelectorAll('.sc-mods li.more').length} more`;
  }));
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
// a slot's answer shows inside its card; a card with an answer spans the whole row
function slotOut(slot, wide) {
  const box = document.querySelector(`.slot-out[data-out="${CSS.escape(slot)}"]`);
  document.querySelectorAll('.slot-out').forEach((x) => { if (x !== box) { x.classList.add('hidden'); x.innerHTML = ''; const c = x.closest('.slot-card'); if (c) c.classList.remove('wide'); } });
  if (!box) return null;
  box.classList.remove('hidden');
  const c = box.closest('.slot-card'); if (c) c.classList.toggle('wide', !!wide);
  return box;
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
  const out = slotOut(slot, act === 'uniques' || act === 'price');
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

// Settings page: the section index jumps to its section, and marks the one you're reading
document.querySelectorAll('.set-toc [data-jump]').forEach((b) => b.addEventListener('click', () => {
  const s = document.getElementById(b.dataset.jump); const main = document.querySelector('.main');
  if (!s || !main) return;
  main.scrollTop += s.getBoundingClientRect().top - main.getBoundingClientRect().top - 16;
  document.querySelectorAll('.set-toc [data-jump]').forEach((x) => x.classList.toggle('active', x === b));
}));
(function () {
  const main = document.querySelector('.main');
  if (!main) return;
  let t = null;
  main.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!document.querySelector('#tab-options.active')) return;
      const top = main.getBoundingClientRect().top + 120;
      let cur = null;
      document.querySelectorAll('.set-section').forEach((s) => { if (s.getBoundingClientRect().top <= top) cur = s.id; });
      if (!cur) { const first = document.querySelector('.set-section'); cur = first && first.id; }
      document.querySelectorAll('.set-toc [data-jump]').forEach((b) => b.classList.toggle('active', b.dataset.jump === cur));
    }, 60);
  });
}());

// Discord community (sidebar and Settings → Startup & updates): opens poe2upgrade.com/discord in the browser
document.querySelectorAll('[data-discord]').forEach((b) => b.addEventListener('click', () => window.api.openUrl('https://poe2upgrade.com/discord')));
// Support the project (Settings → Startup & updates): opens the Ko-fi page in the browser
document.querySelectorAll('[data-kofi]').forEach((b) => b.addEventListener('click', () => window.api.openUrl('https://ko-fi.com/akwhitesoftware')));
