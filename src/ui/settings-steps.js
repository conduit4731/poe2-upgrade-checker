'use strict';
/* global window, document */

// Character page: a guide in steps. Several .build files from one guide (Early, Midgame, Endgame...),
// put in the guide's order (or yours); click a step to switch the build to it. For the step you're on:
// how close your gear is to the step's (mods matched, per slot and overall), and a checklist of the
// gems it uses (what's new since the step before; you tick what you have). The loot filter is only
// made again when you press Update loot filter.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let view = null; let editing = false; let busy = false;
  let notice = ''; // what happened last (switched, added...), shown over the steps
  let filterExists = false;
  const level = (p) => (p >= 80 ? 'good' : p >= 50 ? 'mid' : 'low');
  const bar = (p) => `<span class="mbar ${level(p)}"><span data-w="${Math.max(0, Math.min(100, p))}"></span></span>`;
  const widths = (root) => root.querySelectorAll('[data-w]').forEach((e) => { e.style.width = `${Number(e.dataset.w) || 0}%`; });

  async function refresh() {
    view = await window.api.stepsGet().catch((err) => ({ ok: false, error: err.message, list: [] }));
    const st = await window.api.filterStatus().catch(() => null);
    filterExists = !!(st && st.exists);
    render();
    publish();
  }
  // My gear shows each slot's match with the step you're on
  function publish() {
    const cur = view && view.list && view.list.find((x) => x.current);
    window.__stepMatch = view && view.match && cur ? { step: cur.label, slots: Object.fromEntries(view.match.slots.map((s) => [s.slot, s.match.pct])) } : null;
    if (typeof renderSlots === 'function' && typeof state !== 'undefined' && state) renderSlots();
  }

  function stepper() {
    return `<ol class="stepper">${view.list.map((s, i) => `<li><button class="step${s.current ? ' current' : ''}" data-step="${i}" ${busy ? 'disabled' : ''} title="${esc(s.name)}\n${esc(s.file)}${s.current ? '\nThe step you are on' : '\nSwitch the build to this step'}">
        <span class="st-n">${i + 1}</span><span class="st-text"><span class="st-l">${esc(s.label)}</span><span class="st-m">${s.passives} passives · ${s.gems} gems</span></span></button></li>`).join('')}</ol>`;
  }
  function editor() {
    const sorted = !view.manual;
    return `<div class="steps-edit">
      <div class="dim small">${sorted ? 'In the guide\'s order: fewer passive points first. Move a step to put them in your own order.' : 'In your own order.'}</div>
      <table class="list steps-table">${view.list.map((s, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td><input class="step-name" data-rename="${i}" value="${esc(s.label)}" aria-label="Name of step ${i + 1}"><div class="dim small">${esc(s.file)} · ${s.passives} passives</div></td>
        <td class="nowrap"><button data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Earlier" aria-label="Move up">↑</button> <button data-down="${i}" ${i === view.list.length - 1 ? 'disabled' : ''} title="Later" aria-label="Move down">↓</button></td>
        <td><button class="link" data-remove="${i}">Remove</button></td></tr>`).join('')}</table>
      <div class="row"><button class="primary" id="stepsDone">Done</button>${view.manual ? '<button id="stepsSort">Sort by progression</button>' : ''}</div></div>`;
  }
  function matchHtml(m, label) {
    const rows = m.slots.map((s) => {
      const t = s.target; const mm = s.match;
      const want = t.unique ? `<b class="unique-t">${esc(t.unique)}</b>` : `<b>${esc(t.base || 'Rare')}</b>`;
      const details = [
        mm.missing.length ? `<div><span class="mk miss">Missing</span> ${mm.missing.map(esc).join(' · ')}</div>` : '',
        mm.low.length ? `<div><span class="mk low">Low roll</span> ${mm.low.map((x) => `${esc(x.text)} <span class="dim">(${x.pct}%)</span>`).join(' · ')}</div>` : '',
        mm.note ? `<div class="dim">${esc(mm.note.charAt(0).toUpperCase() + mm.note.slice(1))}.</div>` : '',
        !t.unique && t.mods.length ? `<div class="dim">The step's item: ${t.mods.map(esc).join(' · ')}</div>` : '',
      ].join('');
      return `<details class="mrow"><summary>
          <span class="m-slot">${esc(s.slot)}</span>
          <span class="m-want">${want}</span>
          <span class="m-yours">${s.fromPob ? '<span class="dim">not saved yet</span> <span class="sc-tag" title="This slot holds the guide\'s item: copy yours in game (F2, Set as …)">guide item</span>' : s.yours ? esc(s.yours) : '<span class="dim">nothing saved</span>'}</span>
          <span class="m-count dim">${t.unique ? '' : `${mm.have}/${mm.of} mods`}</span>
          <span class="m-pct">${bar(mm.pct)}<b>${mm.pct}%</b></span>
        </summary><div class="m-detail">${details || '<div class="dim">Everything the step wants is there.</div>'}</div></details>`;
    }).join('');
    return `<div class="match-head"><div><span class="match-big ${level(m.pct)}">${m.pct}%</span></div>
        <div><b>Your gear against ${esc(label)}</b><div class="dim small">Each of the step's mods counts the same: missing is 0, a lower roll counts less. Click a slot for what's missing. A slot marked <span class="sc-tag">guide item</span> still holds the guide's item and counts as 0%: copy your real one in game (F2, Set as …).</div></div></div>
      <div class="mrows"><div class="mrow-h"><span>Slot</span><span>The step wants</span><span>You have</span><span></span><span>Match</span></div>${rows}</div>`;
  }
  function gemsHtml(gems, prevLabel) {
    const all = gems.flatMap((g) => [g, ...g.supports]);
    const have = all.filter((g) => g.mine && g.mine.have).length;
    const fresh = all.filter((g) => g.isNew).length;
    const row = (g, sup) => `<label class="gem${sup ? ' sup' : ''}${g.mine && g.mine.have ? ' have' : ''}">
        <input type="checkbox" data-gem="${esc(g.id)}" ${g.mine && g.mine.have ? 'checked' : ''}>
        <span class="g-name">${esc(g.name)}${g.isNew ? ' <span class="g-new">new</span>' : ''}${!sup && g.from > 1 ? ` <span class="dim small">from level ${g.from}</span>` : ''}</span>
        ${g.max > 1 ? `<input type="number" class="num g-lv" data-gemlv="${esc(g.id)}" min="1" max="${g.max}" placeholder="lvl" value="${g.mine && g.mine.level ? g.mine.level : ''}" aria-label="${esc(g.name)} level" title="Your level (max ${g.max})"><span class="dim small g-max">/ ${g.max}</span>` : '<span></span><span></span>'}
      </label>`;
    return `<div class="gems-head"><b>Gems for this step</b> <span class="dim small">${have} of ${all.length} ticked${prevLabel && fresh ? ` · ${fresh} new since ${esc(prevLabel)}` : ''}</span></div>
      <div class="dim small">Guide files don't say gem levels, and the app can't see your gems: tick what you have and type its level.</div>
      <div class="gem-list">${gems.map((g) => `<div class="gem-group">${row(g, false)}${g.supports.map((s) => row(s, true)).join('')}</div>`).join('')}</div>`;
  }

  function render() {
    const body = $('#stepsBody'); if (!body) return;
    const n = (view && view.list) ? view.list.length : 0;
    $('#stepsEditBtn').classList.toggle('hidden', n < 2 || editing);
    if (!view || !view.ok) { body.innerHTML = `<div class="note">${esc((view && view.error) || 'Couldn\'t load the steps.')}</div>`; return; }
    if (!n) {
      body.innerHTML = '<div class="help">Following a guide with several steps (Early, Midgame, Endgame…)? Add all its <b>.build</b> files here, at once. They\'re put in the guide\'s order, you switch your build to any step with one click, and you see how close your gear is to that step\'s.</div>';
      return;
    }
    const cur = view.list.find((x) => x.current);
    let html = editing ? editor() : stepper();
    if (notice) html += `<div class="steps-note">${notice}</div>`;
    if (!editing) {
      if (!cur) html += '<div class="help steps-pick">Click a step to switch your build to it.</div>';
      else if (view.error) html += `<div class="note">${esc(view.error)}</div>`;
      else if (view.match) html += `<div class="steps-detail"><div class="steps-match">${matchHtml(view.match, cur.label)}</div><div class="steps-gems">${gemsHtml(view.gems || [], view.prevLabel)}</div></div>`;
    }
    body.innerHTML = html;
    widths(body);
    bind(body);
  }

  function bind(body) {
    body.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', async () => {
      const i = Number(b.dataset.step);
      if (busy || view.list[i].current) return;
      busy = true; notice = `<span class="spinner"></span> Switching your build to <b>${esc(view.list[i].label)}</b>…`; render();
      const r = await window.api.stepsSelect(i).catch((err) => ({ ok: false, error: err.message }));
      busy = false;
      if (!r || !r.ok) { notice = `<span class="warn-t">${esc((r && r.error) || 'Couldn\'t switch.')}</span>`; render(); return; }
      notice = `Your build is now <b>${esc(view.list[i].label)}</b>: its passive tree, skills and the guide's gear (in slots you haven't saved your own item).${filterExists ? ' Your loot filter still follows the step you made it with. <button class="primary" id="stepsFilter">Update loot filter</button>' : ''}`;
      if (typeof load === 'function') await load();
      document.querySelector('.tabs button[data-tab="char"]').click();
    }));
    const f = body.querySelector('#stepsFilter');
    if (f) f.addEventListener('click', async () => {
      f.disabled = true; f.innerHTML = '<span class="spinner"></span> Making it again…';
      const r = await window.api.filterRemake().catch((err) => ({ ok: false, error: err.message }));
      notice = r && r.ok ? `Loot filter updated for this step. ${esc(r.message || '')}` : `<span class="warn-t">${esc((r && r.error) || 'Couldn\'t update the loot filter.')}</span>`;
      render();
    });
    body.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', async () => { const i = Number(b.dataset.up); view = await window.api.stepsMove(i, i - 1); render(); }));
    body.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', async () => { const i = Number(b.dataset.down); view = await window.api.stepsMove(i, i + 1); render(); }));
    body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Remove it?'; return; }
      view = await window.api.stepsRemove(Number(b.dataset.remove)); render(); publish();
    }));
    body.querySelectorAll('[data-rename]').forEach((inp) => inp.addEventListener('change', async () => { view = await window.api.stepsRename(Number(inp.dataset.rename), inp.value); }));
    const done = body.querySelector('#stepsDone'); if (done) done.addEventListener('click', () => { editing = false; notice = ''; render(); });
    const sort = body.querySelector('#stepsSort'); if (sort) sort.addEventListener('click', async () => { view = await window.api.stepsSort(); render(); });
    // the gem checklist saves as you tick or type
    body.querySelectorAll('[data-gem]').forEach((c) => c.addEventListener('change', () => {
      const lv = body.querySelector(`[data-gemlv="${CSS.escape(c.dataset.gem)}"]`);
      window.api.stepsGem(c.dataset.gem, { have: c.checked, level: lv ? lv.value : null });
      c.closest('.gem').classList.toggle('have', c.checked);
      gemCount(body);
    }));
    body.querySelectorAll('[data-gemlv]').forEach((inp) => inp.addEventListener('change', () => {
      const c = body.querySelector(`[data-gem="${CSS.escape(inp.dataset.gemlv)}"]`);
      if (inp.value && c && !c.checked) { c.checked = true; c.closest('.gem').classList.add('have'); }
      window.api.stepsGem(inp.dataset.gemlv, { have: c ? c.checked : true, level: inp.value });
      gemCount(body);
    }));
  }
  function gemCount(body) {
    const all = body.querySelectorAll('[data-gem]'); const on = body.querySelectorAll('[data-gem]:checked');
    const h = body.querySelector('.gems-head .dim'); if (h) h.textContent = h.textContent.replace(/^\d+ of \d+ ticked/, `${on.length} of ${all.length} ticked`);
  }

  $('#stepsAddBtn').addEventListener('click', async () => {
    const r = await window.api.stepsAdd().catch((err) => ({ ok: false, error: err.message, list: [] }));
    if (r && r.canceled) return;
    view = r;
    notice = r.added ? `Added ${r.added} step${r.added === 1 ? '' : 's'}${view.manual ? '' : ', in the guide\'s order'}.${view.current == null ? ' Click a step to switch your build to it.' : ''}` : '';
    if (r.errors && r.errors.length) notice += ` <span class="warn-t">${esc(r.errors.join('; '))}</span>`;
    render(); publish();
  });
  $('#stepsEditBtn').addEventListener('click', () => { editing = true; notice = ''; render(); });
  document.querySelector('.tabs button[data-tab="char"]').addEventListener('click', () => refresh());
  window.api.onChanged(() => { if (document.querySelector('#tab-char.active')) refresh(); });
  refresh();
}());
