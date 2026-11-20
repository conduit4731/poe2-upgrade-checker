'use strict';
/* global window, document */

// My gear → a slot's More → Best uniques. Path of Building tries every unique in its item database
// that fits the slot, in your build; best first, with poe.ninja's price and a trade search. The list
// shows under that slot's row (window.showBestUniques(slot, container)).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERDICT = { upgrade: ['UPGRADE', 'up'], small: ['SMALL UPGRADE', 'up'], same: ['SIDEGRADE', 'same'], downgrade: ['DOWNGRADE', 'dn'], risky: ['RISKY', 'warn'], resloss: ['LOSES RESISTANCE', 'dn'], dmgloss: ['LOSES DAMAGE', 'dn'] };
  const slotOf = (v) => (/^Ring [12]$/.test(v) ? 'Ring' : v);
  const pct = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`);
  const price = (u) => (u.priceDiv >= 1 ? `${Math.round(u.priceDiv * 10) / 10} div` : u.price != null ? `${Math.round(u.price)} ${window.__unit || 'ex'}` : '–');
  const SHOW = 12;
  async function show(sel, card) {
    const slot = slotOf(sel);
    card.innerHTML = `<div class="uniq-box" id="uniqueCard"><div class="slot-res"><span class="slot-res-k">Best uniques: ${esc(slot)}</span><span class="note"><span class="spinner"></span> Path of Building is trying every unique that fits…</span></div></div>`;
    let r;
    try { r = await window.api.bestUniques(sel); } catch (err) { r = { ok: false, error: err.message }; }
    const box = card.querySelector('.uniq-box'); if (!box) return;
    if (!r || !r.ok) { box.innerHTML = `<div class="slot-res"><span class="slot-res-k">Best uniques</span><span class="note">${esc((r && r.error) || 'Something went wrong.')}</span></div>`; return; }
    const row = (u) => {
      const v = VERDICT[u.verdict] || [u.verdict, 'same'];
      return `<tr><td><b class="unique">${esc(u.name)}</b><div class="dim small">${esc(u.base || '')}${u.level ? ` · level ${esc(u.level)}` : ''}${r.slot === 'Ring' ? ` · in ${esc(u.slot)}` : ''}</div>${u.breaks && u.breaks.length ? `<div class="small warn">${esc(u.breaks.join('; '))}</div>` : ''}</td>
        <td><span class="verd ${v[1]}">${esc(v[0])}</span><div class="small">${u.score > 0 ? '+' : ''}${esc(u.score)} pts</div></td>
        <td class="small">${u.dps != null ? `Damage ${pct(u.dps)}<br>` : ''}${u.ehp != null ? `Eff. HP ${pct(u.ehp)}` : ''}</td>
        <td>${esc(price(u))}</td>
        <td><button class="link" data-uname="${esc(u.name)}" data-ubase="${esc(u.base || '')}" title="Search the trade site for this unique">Trade</button></td></tr>`;
    };
    const list = r.list || [];
    box.innerHTML = `<div class="slot-res"><span class="slot-res-k">Best uniques: ${esc(r.slot)}</span><span class="dim small">${esc(r.tried || list.length)} tried in your build${r.maxLevel ? `, up to level ${esc(r.maxLevel)}` : ''}${r.cached ? ' (a few minutes ago)' : ''}. Best first; prices from poe.ninja.</span> <button class="link uniq-close">Close</button></div>
      ${list.length ? `<table class="list uniques"><tr><th>Unique</th><th>For your build</th><th>Change</th><th>Price</th><th></th></tr>${list.slice(0, SHOW).map(row).join('')}</table>${list.length > SHOW ? `<button class="link uniq-more">Show all ${list.length}</button>` : ''}` : '<div class="note">No unique fits this slot in your build.</div>'}`;
    const bind = () => box.querySelectorAll('[data-uname]:not([data-bound])').forEach((b) => b.setAttribute('data-bound', '1') || b.addEventListener('click', async () => {
      b.disabled = true;
      try { const res = await window.api.searchUnique(b.dataset.uname, b.dataset.ubase); if (res && res.error) b.title = res.error; } finally { b.disabled = false; }
    }));
    bind();
    const more = box.querySelector('.uniq-more');
    if (more) more.addEventListener('click', () => { box.querySelector('table.uniques').insertAdjacentHTML('beforeend', list.slice(SHOW).map(row).join('')); more.remove(); bind(); });
    box.querySelector('.uniq-close').addEventListener('click', () => { const tr = card.closest('tr'); card.innerHTML = ''; if (tr) tr.classList.add('hidden'); });
  }
  window.showBestUniques = show;
}());
