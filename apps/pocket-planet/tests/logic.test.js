import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, restoreState, moveRover, discoveriesAt, collect, sectorFor, addNote, persist, BEACONS } from '../src/logic.js';
test('rover stays within map and ignores invalid movement', () => {
  assert.deepEqual(moveRover({ x: 50, y: 50 }, 100, -100), { x: 90, y: 12 });
  assert.deepEqual(moveRover({ x: 50, y: 50 }, NaN, Infinity), { x: 10, y: 12 });
});
test('all six discoveries are reachable by arrow controls', () => {
  for (const beacon of BEACONS) {
    let rover = { x: 50, y: 44 };
    for (let i = 0; i < 30; i++) rover = moveRover(rover, Math.abs(rover.x - beacon.x) >= 4 ? Math.sign(beacon.x - rover.x) * 4 : 0, Math.abs(rover.y - beacon.y) >= 4 ? Math.sign(beacon.y - rover.y) * 4 : 0);
    assert.ok(discoveriesAt(rover, []).some(b => b.id === beacon.id));
  }
});
test('collecting is idempotent and unknown IDs never award stardust', () => {
  const first = collect(freshState(), ['fern', 'fern', 'fake']);
  assert.equal(first.stars, 10); assert.deepEqual(first.collected, ['fern']);
  assert.deepEqual(collect(first, ['fern']), first);
  assert.equal(discoveriesAt(BEACONS[0], ['fern']).length, 0);
});
test('coordinates are quantized and habitat is deterministic even south/west', () => {
  assert.deepEqual(sectorFor(-1.23, -2.34), sectorFor(-1.21, -2.31));
  assert.equal(sectorFor(0, 0).habitat, 'Mosslight meadow');
  for (const pair of [[91, 0], [0, -181], [NaN, 0], [0, Infinity]]) assert.throws(() => sectorFor(...pair));
});
test('corrupt and incompatible local state safely resets', () => {
  for (const raw of [null, '', '{', 'null', '{"version":2}']) assert.deepEqual(restoreState(raw), freshState());
  const restored = restoreState(JSON.stringify({ version: 1, collected: ['fern', 'fern', 'no'], stars: -100, notes: [{ image: 'javascript:alert(1)' }], habitat: 'fake' }));
  assert.deepEqual(restored.collected, ['fern']); assert.equal(restored.stars, 10); assert.equal(restored.notes.length, 0);
});
test('bounded local journal preserves honest source and text', () => {
  const note = { id: '1', name: '<b>leaf</b>', image: 'data:image/png;base64,AAAA', kind: 'sample', date: '2026-10-17' };
  const state = addNote(freshState(), note);
  assert.deepEqual(restoreState(JSON.stringify(state)), state);
  assert.throws(() => addNote({ ...state, notes: Array(24).fill(note) }, note), /Journal full/);
});
test('storage failure reports failure without mutating progress', () => {
  const original = freshState();
  assert.equal(persist(collect(original, ['fern']), { setItem() { throw new Error('quota'); } }), false);
  assert.equal(original.stars, 0);
  let stored;
  assert.equal(persist(original, { setItem(key, value) { stored = [key, value]; } }), true);
  assert.equal(stored[0], 'pocket-planet-v1');
});
