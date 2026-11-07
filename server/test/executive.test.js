// Chairman's floor: it is always the top storey, the owner is seated there without a roster line, and anyone
// grouped onto that floor sits in the row across from him. Other groups stay ordinary department floors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore, botIdFor } from '../state.js';
import { slugify } from '../util.js';
import {
  CHAIRMAN_FLOOR_ID, CHAIRMAN_FLOOR_NAME, CHAIRMAN_ID, CHAIRMAN_NAME, CHAIRMAN_LOOK, STAFF_SEATS,
  boardroomLayout, executiveSeats, withChairman,
} from '../../web/lib/executive.js';

const T0 = Date.parse('2026-10-31T12:00:00+02:00');

const FLOOR = '董事长层（Chairman\'s Floor）';
const OFFICE = '办公室（Office）';
const RESOURCE = '智能体资源（Artificial Resource）';
const TECH = '技术部（Technology）';

const HEADS = [
  '办公室主任(Chief of Staff)',
  '智能体资源总管（Head of Artificial Resource）',
  '技术主管（Head of Technology）',
];
const STAFF = [
  ['组织架构顾问（Organization Architect）', OFFICE],
  ['智能体档案管理员（Agent Records Administrator）', RESOURCE],
  ['内部技术专员（Internal Technology Specialist）', TECH],
  ['公司看板运维专员（Company Dashboard Operations Specialist）', TECH],
];

function make() {
  let now = T0;
  const store = new StateStore({ now: () => now, tz: 'Europe/Sofia' });
  const ev = (bot, status, step, extra = {}) => {
    store.apply({ t: new Date(now).toISOString(), bot, status, step, ...extra });
    store.commit();
  };
  return { store, ev };
}

test('the published floor name slugs to the chairman floor and fits a groups line', () => {
  assert.equal(slugify(FLOOR), CHAIRMAN_FLOOR_ID);
  assert.ok(FLOOR.length <= 40, 'feed.js keeps 40 characters of a group name');
  assert.equal(slugify('董事长层'), '', 'Chinese alone would otherwise fall through to the main floor');
});

test('chairman floor is the top storey even when its group is seen first', () => {
  const { store, ev } = make();
  // Seen first: a first-seen or alphabetical sort would put this floor at the bottom.
  for (const name of HEADS) ev(name, 'idle', 'with the chairman', { group: FLOOR });
  for (const [name, group] of STAFF) ev(name, 'working', 'on the floor', { group });
  ev('Loner', 'idle', null);
  const st = store.snapshot();
  assert.deepEqual(st.floors.map((f) => f.id), [
    'office', 'artificial-resource', 'technology', 'general', CHAIRMAN_FLOOR_ID,
  ]);
  assert.deepEqual(st.floors.map((f) => f.order), [1, 2, 3, 4, 5]);
  assert.equal(st.floors.at(-1).name, CHAIRMAN_FLOOR_NAME);
  assert.deepEqual(st.floors.at(-1).bots.map((id) => st.bots[id].name), HEADS);
  for (const [name, group] of STAFF) {
    const bot = st.bots[botIdFor(name)];
    assert.equal(bot.floor, slugify(group));
    assert.notEqual(bot.floor, CHAIRMAN_FLOOR_ID);
  }
  assert.equal(st.bots[CHAIRMAN_ID], undefined, 'the owner is not invented by the channel reducer');
  assert.equal(st.summary.total, HEADS.length + STAFF.length + 1);
});

test('a Chinese-only chairman group and a later English one are the same top floor', () => {
  const { store, ev } = make();
  ev('First', 'idle', null, { group: '董事长层' });
  ev('Second', 'idle', null, { group: "Chairman's Floor" });
  ev('Boss', 'idle', null, { group: '老板层' });
  ev('Tech', 'idle', null, { group: TECH });
  const st = store.snapshot();
  assert.deepEqual(st.floors.map((f) => f.id), ['technology', CHAIRMAN_FLOOR_ID]);
  assert.equal(st.bots.first.floor, CHAIRMAN_FLOOR_ID);
  assert.equal(st.bots.second.floor, CHAIRMAN_FLOOR_ID);
  assert.equal(st.bots.boss.floor, CHAIRMAN_FLOOR_ID);
});

test('groups config moves heads up and an emptied department floor disappears', () => {
  const { store, ev } = make();
  ev(HEADS[0], 'idle', null, { group: OFFICE });
  ev(STAFF[0][0], 'working', 'org chart', { group: OFFICE });
  ev(HEADS[2], 'idle', null, { group: TECH });
  ev(STAFF[2][0], 'working', 'internal', { group: TECH });
  ev(STAFF[3][0], 'idle', null, { group: TECH });
  // The whole artificial-resource floor is only its head, who is about to move up.
  ev(HEADS[1], 'idle', null, { group: RESOURCE });
  ev(STAFF[1][0], 'idle', null, { group: RESOURCE });
  store.setBotsConfig({
    [HEADS[0]]: { floor: FLOOR, look: { shape: 'sphere', color: '#1E86FC', accessory: 'none' } },
    [HEADS[1]]: { floor: FLOOR, look: { shape: 'pill', color: '#14C16F', accessory: 'bow' } },
    [HEADS[2]]: { floor: FLOOR, look: { shape: 'star4', color: '#FB2B3E', accessory: 'antenna' } },
    [STAFF[1][0]]: { floor: OFFICE },
  });
  const st = store.snapshot();
  assert.ok(!st.floors.some((f) => f.id === 'artificial-resource'), 'a floor with nobody left is not shown');
  assert.ok(st.floors.some((f) => f.id === 'office'));
  assert.ok(st.floors.some((f) => f.id === 'technology'));
  assert.equal(st.floors.at(-1).id, CHAIRMAN_FLOOR_ID);
  assert.equal(st.bots[botIdFor(HEADS[0])].floor, CHAIRMAN_FLOOR_ID);
  assert.equal(st.bots[botIdFor(STAFF[0][0])].floor, 'office');
  assert.equal(st.bots[botIdFor(STAFF[1][0])].floor, 'office');
  assert.equal(st.bots[botIdFor(STAFF[2][0])].floor, 'technology');
  assert.equal(st.bots[botIdFor(STAFF[3][0])].floor, 'technology');
  const boss = withChairman(st).bots[CHAIRMAN_ID];
  for (const name of HEADS) assert.notDeepEqual(boss.look, st.bots[botIdFor(name)].look);
});

test('the owner is seated on the top floor even with no roster line, and heads take the arc', () => {
  const { store, ev } = make();
  for (const name of HEADS) ev(name, 'idle', 'reporting', { group: FLOOR });
  for (const [name, group] of STAFF) ev(name, 'idle', 'at desk', { group });
  const st = store.snapshot();
  const raw = JSON.stringify(st.floors);
  const view = withChairman(st);
  assert.equal(JSON.stringify(st.floors), raw, 'decorating the view does not touch the store snapshot');
  assert.equal(st.bots[CHAIRMAN_ID], undefined);

  assert.equal(view.floors.at(-1).id, CHAIRMAN_FLOOR_ID);
  assert.ok(view.floors.every((f, i) => i === view.floors.length - 1 || f.order < view.floors.at(-1).order));
  assert.equal(view.floors.at(-1).bots[0], CHAIRMAN_ID);
  assert.deepEqual(view.floors.at(-1).bots.slice(1), HEADS.map(botIdFor));

  const boss = view.bots[CHAIRMAN_ID];
  assert.equal(boss.name, CHAIRMAN_NAME);
  assert.equal(boss.chairman, true);
  assert.equal(boss.chat_url, null);
  assert.equal(boss.has_glb, false);
  assert.deepEqual(boss.look, CHAIRMAN_LOOK);
  assert.equal(view.summary.total, st.summary.total, 'status totals stay the channel\'s bots');

  const onFloor = view.floors.at(-1).bots.map((id) => view.bots[id]);
  const seats = executiveSeats(onFloor);
  const pose = boardroomLayout();
  assert.equal(seats.get(CHAIRMAN_ID).role, 'chairman');
  assert.deepEqual(HEADS.map((name) => seats.get(botIdFor(name)).index), [0, 1, 2]);
  assert.ok(![...seats.values()].some((s) => s.index === 3), 'the fourth chair stays empty');
  for (const id of view.floors.at(-1).bots) if (id !== CHAIRMAN_ID) assert.equal(view.bots[id].meeting, true);
  assert.equal(pose.staff.length, STAFF_SEATS);

  const again = withChairman(view);
  assert.equal(again.floors.at(-1).counts.idle, view.floors.at(-1).counts.idle);
  assert.equal(again.floors.at(-1).free_desks, view.floors.at(-1).free_desks);
  assert.equal(again.bots[CHAIRMAN_ID].name, CHAIRMAN_NAME);
});

test('with no one grouped upstairs yet, the chairman floor is still the top floor', () => {
  const { store, ev } = make();
  ev('内部技术专员（Internal Technology Specialist）', 'working', 'boards', { group: TECH });
  const view = withChairman(store.snapshot());
  assert.deepEqual(view.floors.map((f) => f.id), ['technology', CHAIRMAN_FLOOR_ID]);
  assert.deepEqual(view.floors.at(-1).bots, [CHAIRMAN_ID]);
  assert.equal(view.floors.at(-1).order, 2);
});

function facing(spot, target) {
  const fx = Math.sin(spot.yaw), fz = Math.cos(spot.yaw);
  const dx = target.x - spot.x, dz = target.z - spot.z;
  return (fx * dx + fz * dz) / Math.hypot(dx, dz);
}

function dist(pose, p) {
  return Math.hypot(p.x - pose.cx, p.z - pose.cz);
}

test('the semicircle opens toward the entrance, staff face the chairman, the fourth chair is real', () => {
  const pose = boardroomLayout();
  const inner = pose.radius - pose.deskHalf;
  const outer = pose.radius + pose.deskHalf;
  assert.equal(pose.staff.length, 4);
  assert.ok(dist(pose, pose.chairman) < inner - 0.2, 'chairman is alone inside the arc');
  for (const s of pose.staff) {
    assert.ok(dist(pose, s) > outer + 0.15, 'staff sit outside the desk');
    assert.ok(s.x < pose.cx, 'staff are on the arc, not in the opening');
    assert.ok(facing(s, pose.chairman) > 0.99, 'each chair faces the chairman');
  }
  assert.ok(pose.chairman.x < pose.cx);
  assert.ok(pose.entrance.x > pose.mouth.x && pose.mouth.x > pose.cx, 'the aisle starts beyond the opening');
  assert.ok(facing(pose.chairman, {
    x: pose.staff.reduce((s, p) => s + p.x, 0) / 4,
    z: pose.staff.reduce((s, p) => s + p.z, 0) / 4,
  }) > 0.95, 'the chairman faces the staff');
  const step = [];
  for (let i = 1; i < 4; i++) step.push(Math.hypot(pose.staff[i].x - pose.staff[i - 1].x, pose.staff[i].z - pose.staff[i - 1].z));
  assert.ok(Math.max(...step) - Math.min(...step) < 0.02, 'four seats are evenly spaced');
  // The walk down the aisle to the opening does not cross a chair.
  for (const s of [pose.chairman, ...pose.staff]) {
    const dx = pose.mouth.x - pose.entrance.x, dz = pose.mouth.z - pose.entrance.z;
    const t = Math.max(0, Math.min(1, ((s.x - pose.entrance.x) * dx + (s.z - pose.entrance.z) * dz) / (dx * dx + dz * dz)));
    const gap = Math.hypot(s.x - (pose.entrance.x + t * dx), s.z - (pose.entrance.z + t * dz));
    assert.ok(gap > 1.1, 'entrance path stays clear');
  }

  const chair = { id: CHAIRMAN_ID, chairman: true, name: CHAIRMAN_NAME };
  const heads = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, desk: i + 1, name: `H${i}` }));
  const three = executiveSeats([chair, ...heads(3)]);
  assert.deepEqual([0, 1, 2].map((i) => three.get(`h${i}`).index), [0, 1, 2]);
  assert.equal([...three.values()].some((s) => s.index === 3), false);
  const other = executiveSeats([
    chair,
    { id: 'z', desk: 3, name: 'Zed' },
    { id: 'a', desk: 1, name: 'Ann' },
    { id: 'm', desk: 2, name: 'Mo' },
  ]);
  assert.deepEqual([other.get('a').index, other.get('m').index, other.get('z').index], [0, 1, 2]);
  const five = executiveSeats([chair, ...heads(5)]);
  assert.equal(five.get('h3').role, 'staff');
  assert.equal(five.get('h4').role, 'extra');
  assert.ok(dist(pose, five.get('h4')) > pose.seatRadius);
});
