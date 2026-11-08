// The baked lounge and a floor's own corner share one zone. The corner has to win, or two chairs occupy one spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAKED_LOUNGE, bakedLoungeVisible, floorFurniturePlan } from '../../web/lib/lounge-visibility.js';

const LAYOUTS = ['sofa', 'media', 'library', 'meeting'];

function settle(chairman, layout) {
  const vis = Object.fromEntries(BAKED_LOUNGE.map((name) => [name, true]));
  let style = null;
  let boardroom = false;
  for (const step of floorFurniturePlan(chairman)) {
    if (step === 'boardroom-on' || step === 'boardroom-off') {
      const on = step === 'boardroom-on';
      for (const name of BAKED_LOUNGE) vis[name] = !on;
      if (on) style = null;
      boardroom = on;
    } else if (step === 'corner') {
      for (const name of BAKED_LOUNGE) vis[name] = bakedLoungeVisible(layout, name);
      style = layout;
    }
  }
  return { vis, style, boardroom };
}

test('sofa corner keeps the baked lounge; the other corners replace it', () => {
  for (const name of BAKED_LOUNGE) {
    assert.equal(bakedLoungeVisible('sofa', name), true, name);
    assert.equal(bakedLoungeVisible(null, name), true, name);
    for (const layout of LAYOUTS.filter((l) => l !== 'sofa')) assert.equal(bakedLoungeVisible(layout, name), false, `${layout} ${name}`);
  }
});

test('a corner is applied after the boardroom is turned off, so the baked chairs stay hidden', () => {
  assert.deepEqual(floorFurniturePlan(false), ['boardroom-off', 'corner']);
  for (const layout of ['media', 'library', 'meeting']) {
    const got = settle(false, layout);
    assert.equal(got.boardroom, false, layout);
    assert.equal(got.style, layout);
    for (const name of BAKED_LOUNGE) assert.equal(got.vis[name], false, `${layout} ${name}`);
  }
  const sofa = settle(false, 'sofa');
  for (const name of BAKED_LOUNGE) assert.equal(sofa.vis[name], true, name);
  assert.equal(sofa.style, 'sofa');
});

test('the chairman floor hides the baked lounge and does not reapply a department corner', () => {
  assert.deepEqual(floorFurniturePlan(true), ['boardroom-on']);
  const got = settle(true, 'sofa');
  assert.equal(got.boardroom, true);
  assert.equal(got.style, null);
  for (const name of BAKED_LOUNGE) assert.equal(got.vis[name], false, name);
});

// Library rug pieces, in metres. The reading chair is the corner's own armchair; the table is the copy placed
// at the old baked-table spot. Radii are the horizontal half-extents of those meshes.
test('library rug pieces sit apart: chair, table, ottoman, lamp', () => {
  const pieces = [
    { name: 'chair', x: 6.7, z: 2.85, r: 0.55 },
    { name: 'table', x: 5.3, z: 2.4, r: 0.55 },
    { name: 'ottoman', x: 5.75, z: 3.72, r: 0.31 },
    { name: 'lamp', x: 7.38, z: 2.12, r: 0.2 },
  ];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
      assert.ok(gap > 0.2, `${a.name} and ${b.name} gap ${gap.toFixed(2)} m`);
    }
  }
});
