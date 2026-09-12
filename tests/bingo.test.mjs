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
test('ToB requires the mega rare OR all three alternatives, approved only', () => {
  const id = 'the-blood-theatre', t = tile(id);
  assert.equal(tileProgress(t, evidence(id, ['Scythe of vitur'], 'pending')).complete, false);
  assert.equal(tileProgress(t, evidence(id, ['Scythe of vitur'])).complete, true);
  assert.equal(tileProgress(t, evidence(id, ['Ghrazi rapier', 'Sanguinesti staff'])).complete, false);
  assert.equal(tileProgress(t, evidence(id, ['Ghrazi rapier', 'Sanguinesti staff', 'Avernic defender hilt'])).complete, true);
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
test('organiser-confirmed activities require an approved completion decision', () => {
  const t = tile('fists-of-fury'), drops = evidence(t.id, ['Activity progress']);
  assert.equal(tileProgress(t, drops).complete, false);
  drops[0].completesTile = true; assert.equal(tileProgress(t, drops).complete, true);
  drops[0].status = 'rejected'; assert.equal(tileProgress(t, drops).complete, false);
  assert.deepEqual(summary(tiles, []), { complete: 0, total: 53, pending: 0 });
});
