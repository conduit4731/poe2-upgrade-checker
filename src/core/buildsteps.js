'use strict';

// A guide in steps: several .build files from one guide (Mobalytics-style variants: "Early",
// "Midgame", "Endgame"...), each with its own tree, skills and gear. Downloaded files come in no
// particular order, so they're put in the guide's order by how far along each one is (passive points,
// then gem and gear counts), and you can reorder them. For the step you're on:
//   - stepGear: the item the step wants in each slot (at the step's end: level 100)
//   - matchItem / matchGear: how close your item is to it, by its mods (have it? how good a roll?)
//   - stepGems: the skills and supports the step uses, and which are new since the step before

const { modToStat, expand } = require('./parser');
const planner = require('./buildplanner');

let DATA = null;
const data = () => DATA || (DATA = require('./buildplanner-data.json'));

const idOf = (e) => (typeof e === 'string' ? e : e && typeof e.id === 'string' ? e.id : null);
const plain = (t) => String(t || '').replace(/<[^>{}]*>\{([^}]*)\}/g, '$1').replace(/<[^>]*>/g, '').replace(/[{}]/g, '').replace(/\r/g, '');

// "non-crit Midgame - 0.5.5 Fubgun Ice Shot" -> "non-crit Midgame" (the guide's name after the dash
// is the same in every step, and the game cuts it short differently in each file)
function shortName(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(' - ');
  return (i > 0 ? s.slice(0, i) : s).slice(0, 60) || 'Step';
}

// what a step file is: its name and how far along the build it is
function stepInfo(b) {
  const skills = b.skills || [];
  const supports = skills.reduce((n, s) => n + ((s && s.support_skills) || []).length, 0);
  return {
    name: String(b.name || '').slice(0, 120),
    label: shortName(b.name),
    passives: (b.passives || []).length,
    gems: skills.length + supports,
    items: (b.inventory_slots || []).length,
  };
}

// the guide's order: fewer passive points first (a guide's later steps have more), then fewer gems
// and items, then by name so it's always the same
function autoOrder(steps) {
  return steps.slice().sort((a, b) => (a.passives - b.passives) || (a.gems - b.gems) || (a.items - b.items) || String(a.label).localeCompare(String(b.label)));
}

const APP_SLOT = { 'Weapon 1': 'Weapon', 'Weapon 2': 'Offhand', Helmet: 'Helmet', 'Body Armour': 'Body Armour', Gloves: 'Gloves', Boots: 'Boots', Amulet: 'Amulet', Belt: 'Belt', 'Ring 1': 'Ring 1', 'Ring 2': 'Ring 2' };
const SLOT = {
  Weapon1: 'Weapon', Weapon: 'Weapon', Offhand1: 'Offhand', Offhand: 'Offhand', Weapon2: 'Offhand',
  Helm: 'Helmet', Helm1: 'Helmet', BodyArmour: 'Body Armour', BodyArmour1: 'Body Armour', Gloves: 'Gloves', Gloves1: 'Gloves',
  Boots: 'Boots', Boots1: 'Boots', Amulet: 'Amulet', Amulet1: 'Amulet', Belt: 'Belt', Belt1: 'Belt', Ring: 'Ring 1', Ring1: 'Ring 1', Ring2: 'Ring 2',
};
const SLOT_ORDER = ['Weapon', 'Offhand', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Belt', 'Ring 1', 'Ring 2'];

// the item a step wants in each gear slot when it's done (the entry that covers level 100; the last
// one when several do). { slot: { unique, base, mods: [text] } }
function stepGear(b) {
  const out = {};
  for (const inv of b.inventory_slots || []) {
    const slot = inv && SLOT[inv.inventory_id];
    if (!slot) continue;
    const [, to] = planner.interval(inv);
    if (to < 100) continue;
    if (inv.unique_name) {
      const u = data().uniques[inv.unique_name];
      out[slot] = { unique: String(inv.unique_name), base: u ? String(u).split('\n')[1] || null : null, mods: [] };
      continue;
    }
    const r = planner.rareFromText(inv.additional_text);
    if (r) out[slot] = { unique: null, base: r.base, mods: r.mods };
  }
  return out;
}

// the skills and supports a step uses, with their names; `prev` (the step before) marks what's new
function stepGems(b, prev) {
  const d = data();
  const had = new Set();
  if (prev) for (const s of prev.skills || []) { had.add(idOf(s)); for (const sp of (s && s.support_skills) || []) had.add(idOf(sp)); }
  const out = [];
  for (const s of b.skills || []) {
    const id = idOf(s); const g = id && d.gems[id];
    if (!g) continue;
    const sups = [];
    for (const sp of (s && s.support_skills) || []) {
      const sid = idOf(sp); const sg = sid && d.gems[sid];
      if (sg) sups.push({ id: sid, name: sg.name, support: true, max: sg.max, isNew: !!prev && !had.has(sid) });
    }
    out.push({ id, name: g.name, support: false, max: g.max, from: planner.interval(s)[0], isNew: !!prev && !had.has(id), supports: sups });
  }
  return out;
}

// the same stat however the item writes it: no "+", no "(Local)"/"(rune)" tags, any case
const normKey = (k) => String(k || '').replace(/^\+/, '').replace(/\s*\((local|rune|augmented|crafted|implicit|enchant|enchanted|desecrated|fractured)\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

// an item's stats as { normalised key: value } (from the app's parsed item: its stats, or its lines)
function itemStats(item) {
  const out = {};
  const add = (k, v) => { if (k == null || !Number.isFinite(Number(v))) return; for (const [kk, vv] of expand(String(k).replace(/^\[(Base|Weapon)\]\s*/, ''), Number(v))) { const n = normKey(kk); out[n] = (out[n] || 0) + vv; } };
  if (item && item.stats && typeof item.stats === 'object') for (const [k, v] of Object.entries(item.stats)) add(k, v);
  else for (const l of (item && item.lines) || []) if (l && l.key) add(l.key, l.value);
  return out;
}

// how close your item is to the one a step wants. target: { unique, base, mods }, item: the app's
// parsed item (or null). -> { pct, have, of, missing: [text], low: [{ text, pct }], note }
// Each of the step's mods counts the same: 0 if your item doesn't have it, else how good your roll is
// next to the guide's (capped at 100%). A unique matches when it's the same unique.
function matchItem(target, item) {
  if (!target) return null;
  if (!item) return { pct: 0, have: 0, of: target.unique ? 1 : target.mods.length, missing: target.unique ? [target.unique] : target.mods.slice(), low: [], note: 'nothing saved in this slot' };
  if (target.unique) {
    const same = String(item.name || '').toLowerCase() === target.unique.toLowerCase();
    return { pct: same ? 100 : 0, have: same ? 1 : 0, of: 1, missing: same ? [] : [target.unique], low: [], note: same ? null : `the step uses the unique ${target.unique}` };
  }
  const mine = itemStats(item);
  let sum = 0; let have = 0; const missing = []; const low = [];
  for (const text of target.mods) {
    const st = modToStat(plain(text));
    if (!st) continue;
    const parts = expand(st.key, st.value).map(([k, v]) => [normKey(k), v]);
    if (!parts.every(([k]) => mine[k] != null)) { missing.push(text); continue; }
    have++;
    // the roll: your value against the guide's (a "reduced"/negative stat just has to be there)
    const ratios = parts.map(([k, v]) => (v > 0 ? Math.max(0, Math.min(1, mine[k] / v)) : 1));
    const r = Math.min(...ratios);
    sum += r;
    if (r < 0.8) low.push({ text, pct: Math.round(r * 100) });
  }
  const of = have + missing.length;
  const sameBase = !target.base || !item.baseType || String(item.baseType).toLowerCase() === String(target.base).toLowerCase();
  return { pct: of ? Math.round((sum / of) * 100) : 0, have, of, missing, low, note: sameBase ? null : `the step uses a ${target.base}` };
}

// every slot of a step against your gear: { slots: [{ slot, target, match }], pct } (pct: the average
// over the slots the step has an item for)
function matchGear(gear, equipped) {
  const slots = [];
  for (const slot of SLOT_ORDER) {
    const target = gear[slot];
    if (!target) continue;
    slots.push({ slot, target, match: matchItem(target, (equipped || {})[slot] || null) });
  }
  const pct = slots.length ? Math.round(slots.reduce((a, s) => a + s.match.pct, 0) / slots.length) : 0;
  return { slots, pct };
}

module.exports = { shortName, stepInfo, autoOrder, stepGear, stepGems, matchItem, matchGear, itemStats, normKey, APP_SLOT, SLOT_ORDER };
