'use strict';

const test = require('node:test');
const assert = require('node:assert');
const steps = require('../src/core/buildsteps');

test('step names lose the guide name after the dash', () => {
  assert.strictEqual(steps.shortName('non-crit Midgame - 0.5.5 Fubgun Ice Shot'), 'non-crit Midgame');
  assert.strictEqual(steps.shortName('Uber Endgame - 0.5.5 Fubgun Ice Shot Dea'), 'Uber Endgame');
  assert.strictEqual(steps.shortName('Just a build'), 'Just a build');
});

test('steps go in the guide order: fewer passive points first', () => {
  const s = [
    { label: 'Uber Endgame', passives: 176, gems: 40, items: 15 },
    { label: 'Early', passives: 133, gems: 38, items: 15 },
    { label: 'Crit Hybrid', passives: 171, gems: 40, items: 15 },
    { label: 'non-crit Midgame', passives: 148, gems: 40, items: 15 },
  ];
  assert.deepStrictEqual(steps.autoOrder(s).map((x) => x.label), ['Early', 'non-crit Midgame', 'Crit Hybrid', 'Uber Endgame']);
});

test("a step's gear is what it wants at level 100", () => {
  const b = { inventory_slots: [
    { inventory_id: 'Ring1', level_interval: [1, 34], additional_text: 'Iron Ring\n1. +20 to maximum Life' },
    { inventory_id: 'Ring1', level_interval: [35, 100], additional_text: 'Prismatic Ring\n1. +120 to maximum Life\n2. +30% to Cold Resistance' },
    { inventory_id: 'Belt1', unique_name: 'Headhunter' },
  ] };
  const g = steps.stepGear(b);
  assert.strictEqual(g['Ring 1'].base, 'Prismatic Ring');
  assert.deepStrictEqual(g['Ring 1'].mods, ['+120 to maximum Life', '+30% to Cold Resistance']);
  assert.strictEqual(g.Belt.unique, 'Headhunter');
});

test('mods matched: having a mod counts, a lower roll counts less', () => {
  const target = { unique: null, base: 'Prismatic Ring', mods: ['+120 to maximum Life', '+30% to Cold Resistance', 'Adds 16 to 25 Cold damage to Attacks'] };
  const item = { name: 'Fate Band', baseType: 'Ruby Ring', stats: { '# to maximum Life': 60, '#% to Cold Resistance': 30 } };
  const m = steps.matchItem(target, item);
  assert.strictEqual(m.have, 2);
  assert.strictEqual(m.of, 3);
  assert.strictEqual(m.pct, 50); // (0.5 + 1 + 0) / 3
  assert.deepStrictEqual(m.missing, ['Adds 16 to 25 Cold damage to Attacks']);
  assert.strictEqual(m.low[0].pct, 50);
  assert.match(m.note, /Prismatic Ring/);
});

test('a better roll than the guide is capped at 100%, local and rune tags are ignored', () => {
  const target = { unique: null, base: 'Obliterator Bow', mods: ['135% increased Physical Damage'] };
  const item = { name: 'x', baseType: 'Obliterator Bow', stats: { '#% increased Physical Damage (Local)': 160 } };
  assert.strictEqual(steps.matchItem(target, item).pct, 100);
});

test('all resistances on the guide item need each resistance on yours', () => {
  const target = { unique: null, base: null, mods: ['+10% to all Elemental Resistances'] };
  const ok = { name: 'x', stats: { '#% to Fire Resistance': 10, '#% to Cold Resistance': 10, '#% to Lightning Resistance': 10 } };
  const no = { name: 'x', stats: { '#% to Fire Resistance': 10 } };
  assert.strictEqual(steps.matchItem(target, ok).pct, 100);
  assert.strictEqual(steps.matchItem(target, no).pct, 0);
});

test('a unique matches only itself, an empty slot is 0%', () => {
  const t = { unique: 'Headhunter', base: 'Heavy Belt', mods: [] };
  assert.strictEqual(steps.matchItem(t, { name: 'Headhunter' }).pct, 100);
  assert.strictEqual(steps.matchItem(t, { name: 'Armageddon Lock' }).pct, 0);
  assert.strictEqual(steps.matchItem(t, null).pct, 0);
});

test('the whole step: the average of the slots it has an item for', () => {
  const gear = { Belt: { unique: 'Headhunter', base: null, mods: [] }, Amulet: { unique: null, base: null, mods: ['+30 to Spirit'] } };
  const r = steps.matchGear(gear, { Belt: { name: 'Headhunter' }, Amulet: { name: 'a', stats: { '# to Spirit': 15 } } });
  assert.strictEqual(r.slots.length, 2);
  assert.strictEqual(r.pct, 75); // (100 + 50) / 2
});

test('gems: names, supports, and what is new since the step before', () => {
  const prev = { skills: [{ id: 'Metadata/Items/Gem/SkillGemIceShot', support_skills: [{ id: 'Metadata/Items/Gems/SupportGemFork' }] }] };
  const b = { skills: [
    { id: 'Metadata/Items/Gem/SkillGemIceShot', support_skills: [{ id: 'Metadata/Items/Gems/SupportGemFork' }] },
    { id: 'Metadata/Items/Gem/SkillGemTornadoShot', level_interval: [41, 100] },
  ] };
  const g = steps.stepGems(b, prev);
  assert.strictEqual(g[0].name, 'Ice Shot');
  assert.strictEqual(g[0].isNew, false);
  assert.strictEqual(g[0].supports[0].name, 'Fork');
  assert.strictEqual(g[1].isNew, true);
  assert.strictEqual(g[1].from, 41);
});
