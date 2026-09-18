import test from 'node:test';
import assert from 'node:assert/strict';
import event from '../october-bingo-ideas.json' with { type: 'json' };
import { buildTiles, tileProgress, slug, summary } from '../shared/bingo.mjs';
const tiles = buildTiles(event);
const tile = id => tiles.find(t => t.id === id);
const evidence = (id, labels, status = 'approved') => labels.map(label => ({ tileId: id, choiceId: slug(label), quantity: 1, status }));
test('catalog preserves all 54 positions and stable unique IDs', () => {
  assert.equal(tiles.length, 54); assert.equal(new Set(tiles.map(t => t.id)).size, 54); assert.equal(tiles[27].free, true);
  for (const t of tiles.filter(t => !t.free)) { assert.ok(t.choices.length); assert.ok(t.legacyRequirements.every(Boolean)); for (const p of t.paths || []) for (const g of p) assert.ok(g.quantity > 0); }
});
test('ToB requires a scythe OR hilt, any Justiciar piece and either weapon, approved only', () => {
  const id = 'the-blood-theatre', t = tile(id);
  assert.equal(tileProgress(t, evidence(id, ['Scythe of vitur'], 'pending')).complete, false);
  assert.equal(tileProgress(t, evidence(id, ['Scythe of vitur'])).complete, true);
  assert.equal(tileProgress(t, evidence(id, ['Ghrazi rapier', 'Sanguinesti staff'])).complete, false);
  assert.equal(tileProgress(t, evidence(id, ['Ghrazi rapier', 'Sanguinesti staff', 'Avernic defender hilt'])).complete, false);
  for (const armour of ['Justiciar faceguard', 'Justiciar chestguard', 'Justiciar legguards']) {
    for (const weapon of ['Ghrazi rapier', 'Sanguinesti staff']) {
      const required = ['Avernic defender hilt', armour, weapon];
      assert.equal(tileProgress(t, evidence(id, required)).complete, true);
      for (let missing = 0; missing < required.length; missing++) {
        const drops = evidence(id, required); drops[missing].status = 'pending';
        assert.equal(tileProgress(t, drops).complete, false);
        drops[missing].status = 'rejected';
        assert.equal(tileProgress(t, drops).complete, false);
      }
    }
  }
  assert.equal(tileProgress(t, evidence(id, ['Scythe of vitur'], 'rejected')).complete, false);
});
test('CoX and ToA count choices within each group without skipping a group', () => {
  for (const id of ['the-catacombs-of-xeric', 'the-pharaoh-s-curse']) {
    const t = tile(id); assert.ok(t);
    // Use the authoritative catalog spelling for a valid alternative in each group.
    const chosen = t.paths[1].map(group => group.items[0]);
    assert.equal(tileProgress(t, evidence(id, chosen)).complete, true);
    assert.equal(tileProgress(t, evidence(id, chosen.slice(1))).complete, false);
  }
});
test('Vorkath accumulates three heads plus necklace plus one bonus drop', () => {
  const id = 'the-reanimated-wyvern', t = tile(id);
  const drops = evidence(id, ["Vorkath's head", "Vorkath's head", 'Dragonbone necklace', 'Vorki']);
  assert.equal(tileProgress(t, drops).complete, false);
  drops.push(...evidence(id, ["Vorkath's head"])); assert.equal(tileProgress(t, drops).complete, true);
});
test('any Virtus piece and either pet path complete their tiles', () => {
  assert.equal(tileProgress(tile('the-voice-in-the-dark'), evidence('the-voice-in-the-dark', ['Virtus robe bottom'])).complete, true);
  for (const id of ['the-corpse-eater', 'the-fallen-seraph']) {
    const t = tile(id); assert.equal(tileProgress(t, evidence(id, [t.paths[0][0].items[0]])).complete, true);
  }
});

test('all listed-drop checklists require each approved quantity, not a manual flag or excess of one item', () => {
  const entries = [...Object.values(event.tiers).flat(), ...event.items].filter(entry => entry.completion_mode === 'all');
  assert.equal(entries.length, 24);
  for (const entry of entries) {
    const t = tile(entry.tile_id), groups = t.paths[0];
    const drops = groups.map(g => ({ tileId: t.id, choiceId: slug(g.items[0]), quantity: g.quantity, status: 'approved' }));
    assert.equal(tileProgress(t, drops).complete, true, t.title);
    for (let missing = 0; missing < drops.length; missing++) {
      const partial = drops.map(s => ({ ...s, completesTile: true }));
      partial[missing].quantity--;
      assert.equal(tileProgress(t, partial).complete, false, `${t.title}: missing quantity`);
      partial[missing] = { ...drops[missing], status: 'pending' };
      assert.equal(tileProgress(t, partial).complete, false, `${t.title}: pending`);
      partial[missing].status = 'rejected';
      assert.equal(tileProgress(t, partial).complete, false, `${t.title}: rejected`);
    }
    if (drops.length > 1) assert.equal(tileProgress(t, [{ ...drops[0], quantity: 100 }]).complete, false, t.title);
  }
});

test('counted drops accumulate across screenshots and only finish at the threshold', () => {
  for (const [id, label, needed] of [['the-six-brothers', 'Barrows pieces', 10], ['rat-king-rumble', "Scurrius' spine", 5], ['the-red-labyrinth', 'Crystal armor seeds', 5]]) {
    const drops = evidence(id, Array(needed - 1).fill(label));
    assert.equal(tileProgress(tile(id), drops).complete, false);
    drops.push(...evidence(id, [label]));
    assert.equal(tileProgress(tile(id), drops).complete, true);
  }
});

test('Exorcist needs both sets; Hungry Chest accepts either five completions or one rare reward', () => {
  const t = tile('the-exorcist');
  const shards = { tileId: t.id, choiceId: 'venator-shards', quantity: 5, status: 'approved' };
  const icons = { tileId: t.id, choiceId: 'ancient-icons', quantity: 3, status: 'approved' };
  assert.equal(tileProgress(t, [shards]).complete, false);
  assert.equal(tileProgress(t, [icons]).complete, false);
  assert.equal(tileProgress(t, [shards, { ...icons, quantity: 2 }]).complete, false);
  assert.equal(tileProgress(t, [shards, icons]).complete, true);
  assert.equal(tileProgress(t, [{ tileId: t.id, choiceId: 'activity-progress', quantity: 10, status: 'approved', completesTile: true }]).complete, false);
  const mimic = tile('the-hungry-chest');
  assert.equal(tileProgress(mimic, [{ tileId: mimic.id, choiceId: 'mimic-completions', quantity: 4, status: 'approved' }]).complete, false);
  assert.equal(tileProgress(mimic, [{ tileId: mimic.id, choiceId: 'mimic-completions', quantity: 5, status: 'approved' }]).complete, true);
  assert.equal(tileProgress(mimic, evidence(mimic.id, ['Rare clue-table reward'])).complete, true);
  const bonus = tile('the-witching-hour');
  assert.equal(bonus.choices.some(c => c.id === 'the-hungry-chest--mimic-completions'), false);
  assert.equal(bonus.choices.some(c => c.id === 'the-hungry-chest--rare-clue-table-reward'), true);
});
test('Revenant Hunter tracks each alternative and completes with any one approved drop', () => {
  const t = tile('revenant-hunter');
  const labels = ['Ancient emblem', 'Ancient totem', 'Ancient statuette'];
  assert.deepEqual(t.choices.map(c => c.label), labels);
  for (const [index, label] of labels.entries()) {
    for (const status of ['pending', 'rejected', 'approved']) {
      const progress = tileProgress(t, evidence(t.id, [label], status));
      assert.equal(progress.complete, status === 'approved');
      assert.deepEqual(progress.paths.map(p => p[0].current), labels.map((_, i) => i === index && status === 'approved' ? 1 : 0));
    }
  }
  assert.equal(tileProgress(t, [{tileId:t.id,choiceId:'activity-progress',quantity:1,status:'approved',completesTile:true}]).complete, false);
  const bonus = tile('the-witching-hour');
  for (const label of labels) assert.ok(bonus.choices.some(c => c.id === `${t.id}--${slug(label)}`));
});

test('organiser-confirmed activities require an approved completion decision', () => {
  const t = tile('fists-of-fury'), drops = evidence(t.id, ['Activity progress']);
  assert.equal(tileProgress(t, drops).complete, false);
  drops[0].completesTile = true; assert.equal(tileProgress(t, drops).complete, true);
  drops[0].status = 'rejected'; assert.equal(tileProgress(t, drops).complete, false);
  assert.deepEqual(summary(tiles, []), { complete: 0, total: 52, bonusPoints: 0, pending: 0 });
});

test('Grave Robber tracks one of each sceptre component while retaining its board description', () => {
  const t = tile('grave-robber');
  const pieces = ['Right skull half', 'Left skull half', 'Top of sceptre', 'Bottom of sceptre'];
  assert.equal(t.description, 'Obtain a Skull sceptre from the Stronghold of Security.');
  assert.deepEqual(t.choices.map(c => c.label), pieces);
  assert.deepEqual(t.paths[0].map(g => g.quantity), [1, 1, 1, 1]);
  const drops = evidence(t.id, pieces);
  assert.equal(tileProgress(t, drops).complete, true);
  for (let i = 0; i < pieces.length; i++) {
    const partial = drops.map((s, index) => ({ ...s, status: index === i ? 'pending' : 'approved' }));
    assert.equal(tileProgress(t, partial).complete, false);
    assert.equal(tileProgress(t, partial).paths[0][i].current, 0);
    partial[i].status = 'rejected';
    assert.equal(tileProgress(t, partial).complete, false);
  }
  assert.equal(tileProgress(t, [{ ...drops[0], quantity: 4, completesTile: true }]).complete, false);
  assert.equal(tileProgress(t, [{ tileId: t.id, choiceId: 'activity-progress', quantity: 1, status: 'approved', completesTile: true }]).complete, false);
  const bonus = tile('the-witching-hour');
  assert.ok(pieces.every(piece => bonus.choices.some(c => c.id === `grave-robber--${slug(piece)}`)));
  const bonuses = pieces.map(piece => ({ tileId: bonus.id, choiceId: `grave-robber--${slug(piece)}`, quantity: 1, status: 'approved' }));
  assert.equal(tileProgress(bonus, bonuses).bonusPoints, 1);
});

test('Arachnophobia tracks one approved Sarachnis cudgel', () => {
  const t = tile('arachnophobia');
  assert.equal(t.description, 'Obtain 1 Sarachnis cudgel.');
  assert.deepEqual(t.choices.map(c => c.label), ['Sarachnis cudgel']);
  assert.equal(t.paths[0][0].quantity, 1);
  const drops = evidence(t.id, ['Sarachnis cudgel']);
  assert.equal(tileProgress(t, drops).complete, true);
  assert.equal(tileProgress(t, drops).paths[0][0].current, 1);
  for (const status of ['pending', 'rejected']) assert.equal(tileProgress(t, [{ ...drops[0], status }]).complete, false);
  assert.equal(tileProgress(t, [{ ...drops[0], choiceId: 'activity-progress', completesTile: true }]).complete, false);
  assert.ok(tile('the-witching-hour').choices.some(c => c.id === 'arachnophobia--sarachnis-cudgel'));
});

test('Witching Hour credits each board tile once regardless of completion and ignores legacy entries', () => {
  const t = tile('the-witching-hour');
  const claim = (source, drop, overrides = {}) => ({ id: crypto.randomUUID(), tileId: t.id, choiceId: `${source}--${slug(drop)}`, quantity: 1, status: 'approved', ...overrides });
  const drops = [
    claim('the-voice-in-the-dark', 'Bellator vestige'),
    claim('the-voice-in-the-dark', "Siren's staff"),
    claim('the-blood-theatre', 'Justiciar faceguard'),
    claim('the-blood-theatre', 'Scythe of vitur', { status: 'pending' }),
    claim('the-frozen-feast', 'Magus vestige', { status: 'rejected' }),
    claim('free-space', 'Activity progress'),
    claim('fists-of-fury', 'Activity progress'),
    claim('the-witching-hour', 'Activity progress'),
    claim('the-frozen-feast', 'Magus vestige', { quantity: 10000 }),
    ...evidence(t.id, ['Activity progress']),
    ...evidence('the-voice-in-the-dark', ['Bellator vestige'])
  ];
  assert.equal(t.bonus, true);
  assert.equal(tileProgress(t, []).bonusPoints, 0);
  assert.equal(tileProgress(t, drops).bonusPoints, 2);
  assert.equal(tileProgress(t, drops).complete, false);
  assert.deepEqual(summary(tiles, drops), { complete: 1, total: 52, bonusPoints: 2, pending: 1 });
  drops[0].status = 'rejected';
  assert.equal(tileProgress(t, drops).bonusPoints, 2);
  drops[1].status = 'pending';
  assert.equal(tileProgress(t, drops).bonusPoints, 1);
});
