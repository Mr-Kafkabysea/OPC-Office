// Which baked lounge nodes a floor shows, and the order that decision is applied in.
//
// The open-floor template always carries the GLB lounge (sofa, two armchairs, coffee table). Corners other than
// `sofa` build their own seating in that same zone. Turning the boardroom off reveals every departmental mesh,
// including that lounge, so the corner has to be applied afterwards or the baked chairs land on top of the corner's.

export const BAKED_LOUNGE = ['sofa', 'armchair_1', 'armchair_2', 'coffee_table'];

/** Steps for one open floor. `corner` must follow `boardroom-off`: that step is what hides the baked lounge. */
export function floorFurniturePlan(chairman) {
  return chairman ? ['boardroom-on'] : ['boardroom-off', 'corner'];
}

/** Baked lounge nodes stay only on the sofa corner (and when no corner is in play). */
export function bakedLoungeVisible(layout, name) {
  if (!BAKED_LOUNGE.includes(name)) return true;
  return layout == null || layout === 'sofa';
}
