'use strict';
/* global window, document */

// Character page: a guide in steps. Several .build files from one guide (Early, Midgame, Endgame...),
// in the guide's order (or yours).
//   - the step bar (under the character's stats): click a step to switch the build to it; the overall
//     gear match; after a switch, Update loot filter
//   - Build & guide settings: add step files, rename, reorder, remove
// The per-slot match and the gems you have are shown in the page's own Gear and Skills lists
// (character.js), from window.__stepsView.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let view = null; let busy = false;
  let notice = ''; // what just happened (switched, filter updated), shown under the step bar
  let filterExists = false;
  const level = (p) => (p >= 80 ? 'good' : p >= 50 ? 'mid' : 'low');

  async function refresh() {
    view = await window.api.stepsGet().catch((err) => ({ ok: false, error: err.message, list: [] }));
    const st = await window.api.filterStatus().catch(() => null);
    filterExists = !!(st && st.exists);
    window.__stepsView = view;
    renderManage();
    publish();
    return view;
  }
  window.refreshSteps = refresh;
  // My gear shows each slot's match with the step you're on
  function publish() {
    const cur = view && view.list && view.list.find((x) => x.current);
    window.__stepMatch = view && view.match && cur ? { step: cur.label, slots: Object.fromEntries(view.match.slots.map((s) => [s.slot, s.match.pct])) } : null;
    if (typeof renderSlots === 'function' && typeof state !== 'undefined' && state) renderSlots();
  }

  // ---------- the step bar, under the character's stats ----------
  function renderStepBar() {
    const el = $('#stepBar'); if (!el) return;
    if (!view || !view.ok || !view.list.length) {
      el.innerHTML = view && view.ok ? '<div class="stepbar-empty dim">Following a guide in steps (Early, Midgame, Endgame…)? Add its .build files under <button class="link" id="stepsOpenSettings">Build &amp; guide settings</button> to switch between them here and see how close your gear is.</div>' : '';
      const o = el.querySelector('#stepsOpenSettings'); if (o) o.addEventListener('click', openSettings);
      return;
    }
    const cur = view.list.find((x) => x.current);
    const m = view.match;
    el.innerHTML = `<div class="stepbar">
        <ol class="stepper">${view.list.map((s, i) => `<li><button class="step${s.current ? ' current' : ''}" data-step="${i}" ${busy ? 'disabled' : ''} title="${esc(s.name)}${s.current ? '\nThe step you are on' : '\nSwitch the build to this step'}">
          <span class="st-n">${i + 1}</span><span class="st-l">${esc(s.label)}</span></button></li>`).join('')}</ol>
        ${cur && m ? `<div class="stepbar-match" title="How close your gear is to the ${esc(cur.label)} step's items, by their mods. Per slot under Gear."><span class="sbm-k">Gear match</span><span class="sbm-v ${level(m.pct)}">${m.pct}%</span></div>` : ''}
      </div>
      ${!cur ? '<div class="stepbar-note dim">Click the step you are on to switch your build to it.</div>' : ''}
      ${view.error ? `<div class="note">${esc(view.error)}</div>` : ''}
      ${notice ? `<div class="stepbar-note">${notice}</div>` : ''}`;
    el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => select(Number(b.dataset.step))));
    const f = el.querySelector('#stepsFilter');
    if (f) f.addEventListener('click', updateFilter);
  }
  window.renderStepBar = renderStepBar;

  async function select(i) {
    if (busy || !view.list[i] || view.list[i].current) return;
    busy = true; notice = `<span class="spinner"></span> Switching your build to <b>${esc(view.list[i].label)}</b>…`; renderStepBar();
    const r = await window.api.stepsSelect(i).catch((err) => ({ ok: false, error: err.message }));
    busy = false;
    if (!r || !r.ok) { notice = `<span class="warn-t">${esc((r && r.error) || 'Couldn\'t switch.')}</span>`; renderStepBar(); return; }
    notice = `Switched to <b>${esc(view.list[i].label)}</b>: passive tree, skills and the guide's items in slots you haven't saved.${filterExists ? ' <button class="primary" id="stepsFilter">Update loot filter</button>' : ''}`;
    if (typeof load === 'function') await load();
    document.querySelector('.tabs button[data-tab="char"]').click(); // the page again, for the new step
  }
  async function updateFilter() {
    const f = $('#stepsFilter'); if (f) { f.disabled = true; f.innerHTML = '<span class="spinner"></span> Making it again…'; }
    const r = await window.api.filterRemake().catch((err) => ({ ok: false, error: err.message }));
    notice = r && r.ok ? 'Loot filter updated for this step.' : `<span class="warn-t">${esc((r && r.error) || 'Couldn\'t update the loot filter.')}</span>`;
    renderStepBar();
  }
  function openSettings() { const d = $('#charSettings'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }

  // ---------- managing the steps (Build & guide settings) ----------
  function renderManage() {
    const body = $('#stepsBody'); if (!body) return;
    if (!view || !view.ok) { body.innerHTML = `<div class="note">${esc((view && view.error) || 'Couldn\'t load the steps.')}</div>`; return; }
    if (!view.list.length) { body.innerHTML = '<div class="help">Add all of a guide\'s step files (.build) at once: they\'re put in the guide\'s order, and you switch between them in the step bar at the top of this page.</div>'; return; }
    body.innerHTML = `<div class="dim small">${view.manual ? 'In your own order.' : 'In the guide\'s order: fewer passive points first.'}${view.manual ? ' <button class="link" id="stepsSort">Back to the guide\'s order</button>' : ''}</div>
      <table class="list steps-table">${view.list.map((s, i) => `<tr${s.current ? ' class="cur"' : ''}>
        <td class="c">${i + 1}</td>
        <td><input class="step-name" data-rename="${i}" value="${esc(s.label)}" aria-label="Name of step ${i + 1}"><div class="dim small">${esc(s.file)} · ${s.passives} passives · ${s.gems} gems${s.current ? ' · <b>current</b>' : ''}</div></td>
        <td class="nowrap"><button data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Earlier" aria-label="Move up">↑</button> <button data-down="${i}" ${i === view.list.length - 1 ? 'disabled' : ''} title="Later" aria-label="Move down">↓</button></td>
        <td><button class="link" data-remove="${i}">Remove</button></td></tr>`).join('')}</table>`;
    const after = (v) => { view = v; window.__stepsView = v; renderManage(); renderStepBar(); };
    body.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', async () => { const i = Number(b.dataset.up); after(await window.api.stepsMove(i, i - 1)); }));
    body.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', async () => { const i = Number(b.dataset.down); after(await window.api.stepsMove(i, i + 1)); }));
    body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Remove it?'; return; }
      after(await window.api.stepsRemove(Number(b.dataset.remove))); publish();
    }));
    body.querySelectorAll('[data-rename]').forEach((inp) => inp.addEventListener('change', async () => after(await window.api.stepsRename(Number(inp.dataset.rename), inp.value))));
    const sort = body.querySelector('#stepsSort'); if (sort) sort.addEventListener('click', async () => after(await window.api.stepsSort()));
  }

  $('#stepsAddBtn').addEventListener('click', async () => {
    const r = await window.api.stepsAdd().catch((err) => ({ ok: false, error: err.message, list: [] }));
    if (r && r.canceled) return;
    view = r; window.__stepsView = r;
    notice = r.added ? `Added ${r.added} step${r.added === 1 ? '' : 's'}.` : '';
    if (r.errors && r.errors.length) notice += ` <span class="warn-t">${esc(r.errors.join('; '))}</span>`;
    renderManage(); renderStepBar(); publish();
  });
  window.api.onChanged(() => { if (!document.querySelector('#tab-char.active')) refresh(); });
  refresh();
}());
