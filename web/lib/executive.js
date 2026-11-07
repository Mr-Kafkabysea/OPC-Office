// The chairman's floor. The human owner is not a roster bot: the channel never lists him, and this layer only
// decorates the snapshot the office already built. Department floors stay whatever `groups` says they are.
// Anyone grouped onto this floor takes the next chair on the arc. The names are not fixed here.

export const CHAIRMAN_FLOOR_ID = 'chairman-s-floor';
export const CHAIRMAN_FLOOR_NAME = '董事长层（Chairman\'s Floor）';
export const CHAIRMAN_ID = 'boss-kj';
export const CHAIRMAN_NAME = '董事长（Boss KJ）';

// A dark slate suit and glasses. Not taken from any employee look, and not one of the bright app-palette colours
// the roster bots are dressed in.
export const CHAIRMAN_LOOK = { shape: 'rounded_cube', color: '#3D4F6F', accessory: 'glasses' };

// Semicircular board table. The arc bulges toward the left wall (−x) and the opening faces +x, where the
// door is. The chairman sits alone inside the arc, facing the staff. Four staff chairs are fixed on the
// outside of the arc, evenly spaced, facing him. A missing person leaves that chair empty.
export const STAFF_SEATS = 4;
const BOARD = {
  cx: 0.4,
  cz: 0.15,
  radius: 2.55,       // desk centreline
  deskHalf: 0.38,
  seatRadius: 3.48,   // chair centres, outside the desk
  seatY: 0.47,
};

/** Point on the arc. φ = 0 is the back of the curve (−x); ±π/2 are the ends of the diameter. Opening is +x. */
export function arcPoint(radius, phi) {
  return {
    x: BOARD.cx - radius * Math.cos(phi),
    z: BOARD.cz + radius * Math.sin(phi),
  };
}

const STATUSES = ['working', 'idle', 'waiting_user', 'error', 'stuck', 'done'];

/** True for the chairman floor's own name, in Chinese or English, with or without the parenthetical. */
export function isChairmanFloorName(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('董事长层') || s.includes('老板层')) return true;
  const flat = s.replace(/['’]/g, '').replace(/\s+/g, ' ');
  return flat.includes('chairmans floor') || flat === 'chairman floor' || flat.includes('chairman floor');
}

/** The primary chairman floor, not an overflow slab (`chairman-s-floor-2`). */
export function isChairmanFloor(floor) {
  if (!floor || typeof floor !== 'object') return false;
  if (floor.id === CHAIRMAN_FLOOR_ID) return true;
  if (typeof floor.id === 'string' && floor.id.startsWith(`${CHAIRMAN_FLOOR_ID}-`)) return false;
  return isChairmanFloorName(floor.name);
}

function zeroCounts() {
  return Object.fromEntries(STATUSES.map((s) => [s, 0]));
}

/** The boardroom geometry, shared by the meshes (scene/boardroom.js) and the seat assignment. */
export function boardroomLayout() {
  const { cx, cz, radius, deskHalf, seatRadius, seatY } = BOARD;
  const inner = radius - deskHalf;
  const chairOff = (4 * inner) / (3 * Math.PI);          // centroid of the semicircular interior, toward the arc
  const chairman = { x: cx - chairOff, y: seatY, z: cz, yaw: -Math.PI / 2, role: 'chairman' };
  const staff = [];
  for (let i = 0; i < STAFF_SEATS; i++) {
    const phi = (-3 + 2 * i) * Math.PI / 8;              // −67.5° … 67.5°, even steps along the half-arc
    const p = arcPoint(seatRadius, phi);
    staff.push({ x: p.x, y: seatY, z: p.z, yaw: Math.atan2(chairman.x - p.x, chairman.z - p.z), index: i, role: 'staff' });
  }
  return {
    ...BOARD,
    chairman,
    staff,
    // The door is on the right, in line with the opening, so the walk in is a straight empty path.
    entrance: { x: 6.85, z: cz },
    mouth: { x: cx + 1.35, z: cz },
  };
}

/**
 * Seats on the chairman floor. The chairman is inside the arc; the first four people grouped here, in
 * arrival order, take the four outside chairs left to right. Further people stand along the left wall,
 * off the arc, so the four chairs are never squeezed or given an invented occupant.
 * @returns {Map<string, {x:number,y:number,z:number,yaw:number}>}
 */
export function executiveSeats(bots) {
  const pose = boardroomLayout();
  const list = Array.isArray(bots) ? bots : [];
  const chair = list.find((b) => b && b.chairman);
  const heads = list
    .filter((b) => b && b.id && !b.chairman)
    .sort((a, b) => (Number(a.desk) || 0) - (Number(b.desk) || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
  const map = new Map();
  if (chair && chair.id) map.set(chair.id, pose.chairman);
  heads.slice(0, STAFF_SEATS).forEach((b, i) => map.set(b.id, pose.staff[i]));
  heads.slice(STAFF_SEATS).forEach((b, i) => {
    map.set(b.id, { x: -6.4, y: pose.seatY, z: 2.2 - i * 1.15, yaw: Math.PI / 2, role: 'extra' });
  });
  return map;
}

function chairmanBot(floorId) {
  return {
    id: CHAIRMAN_ID,
    name: CHAIRMAN_NAME,
    floor: floorId,
    desk: null,
    group: null,
    status: 'idle',
    effective_status: 'idle',
    step: 'Chairman',
    task: null,
    since: null,
    last_event: null,
    last_seen: null,
    unreported: null,
    usage_pct: null,
    usage_share: null,
    chat_url: null,
    avatar: CHAIRMAN_ID,
    color: CHAIRMAN_LOOK.color,
    look: { ...CHAIRMAN_LOOK },
    has_glb: false,
    chairman: true,
    meeting: true,
    today: { working_min: 0, events: 0, tasks_done: 0, hourly: new Array(24).fill(0) },
    history: [],
    schedule: [],
  };
}

/**
 * A view of `state` with the chairman floor on top and 董事长（Boss KJ） seated on it.
 * Does not mutate `state` (the store cache and the channel snapshot stay as they were). Idempotent.
 */
export function withChairman(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const srcBots = state.bots && typeof state.bots === 'object' ? state.bots : {};
  const hadChair = srcBots[CHAIRMAN_ID]?.chairman === true;
  const floors = (Array.isArray(state.floors) ? state.floors : []).map((f) => ({
    ...f,
    bots: Array.isArray(f.bots) ? f.bots.filter((id) => id !== CHAIRMAN_ID) : [],
    counts: { ...zeroCounts(), ...(f.counts || {}) },
  }));
  const bots = { ...srcBots };
  delete bots[CHAIRMAN_ID];

  let fl = floors.find((f) => f.id === CHAIRMAN_FLOOR_ID);
  if (!fl) {
    fl = {
      id: CHAIRMAN_FLOOR_ID,
      name: CHAIRMAN_FLOOR_NAME,
      order: 0,
      bots: [],
      counts: zeroCounts(),
      free_desks: 20,
    };
    floors.push(fl);
  }
  if (hadChair) {
    if (fl.counts.idle > 0) fl.counts.idle -= 1;
    if (Number.isFinite(Number(fl.free_desks))) fl.free_desks = Number(fl.free_desks) + 1;
  }
  if (!fl.name) fl.name = CHAIRMAN_FLOOR_NAME;
  fl.bots.unshift(CHAIRMAN_ID);
  fl.counts.idle = (Number(fl.counts.idle) || 0) + 1;
  if (Number.isFinite(Number(fl.free_desks))) fl.free_desks = Math.max(0, Number(fl.free_desks) - 1);

  const rest = floors.filter((f) => f !== fl);
  rest.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  rest.forEach((f, i) => { f.order = i + 1; });
  fl.order = rest.length + 1;
  const stacked = [...rest, fl];

  bots[CHAIRMAN_ID] = chairmanBot(fl.id);
  for (const id of fl.bots) {
    if (id !== CHAIRMAN_ID && bots[id]) bots[id] = { ...bots[id], meeting: true };
  }

  return { ...state, floors: stacked, bots };
}
