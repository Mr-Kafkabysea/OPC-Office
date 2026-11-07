// Glue: keeps the view (floor, selection) and feeds the scene and the UI.
// The office opens for a channel in the link (#<topic>, feed.js / lib/feedbase.js), a channel this browser
// already opened (the hash is put back in the address bar first), ?demo=1, or a local journal at /api/state.
// A bare public visit has none of those, so the page stays locked and does not load the sample roster.
import { withChairman } from './lib/executive.js';
import { CHANNEL_KEY, entryLocation } from './lib/access.js';

const POLL_MS = 1000;
const view = { currentFloor: null, selectedBot: null };
let state = null;
let demoTimer = null;
let renderScene = null;
let renderUI = () => {};
let zoom = () => {};
let focusBot = () => {};
let sfx = null;

function readSaved() {
  try { return JSON.parse(localStorage.getItem(CHANNEL_KEY) || 'null'); } catch { return null; }
}

function remember(channel) {
  try { localStorage.setItem(CHANNEL_KEY, JSON.stringify({ hash: channel.hash, search: channel.search })); } catch { /* private mode */ }
}

const plan = entryLocation(location.pathname, location, readSaved());
if (plan.href) history.replaceState(null, '', plan.href);
addEventListener('hashchange', () => location.reload());   // another channel: start over

if (plan.access.mode === 'feed') {
  remember(plan.access.channel);
  document.documentElement.dataset.gate = 'open';
  await openFeed(plan.access.channel);
} else if (plan.access.mode === 'demo') {
  document.documentElement.dataset.gate = 'open';
  await openDemo();
} else {
  document.documentElement.dataset.gate = 'locked';
  probeJournal();
}

async function loadOffice() {
  const scene = await import('./scene/scene.js');
  const sound = await import('./audio/sound.js');
  const ui = await import('./ui/ui.js');
  renderScene = scene.renderScene;
  zoom = scene.zoom;
  focusBot = scene.focusBot;
  sfx = sound.sfx;
  renderUI = ui.renderUI;
  scene.initScene(document.getElementById('scene'), {
    onSelectBot: (id) => select(id),
    onHoverBot: (id) => sfx.hover(id),
  });
  ui.initUI({
    onSelectBot: (id) => select(id),
    onSelectFloor: (id) => setFloor(id),
    onZoom: (dir) => { zoom(dir); sfx.zoom(dir); },
    onOpenChat: (id, url) => { if (url) location.href = url; },
  });
  sound.initSound({ slot: document.querySelector('#topbar .bhq-right') });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });
}

function select(id) {
  const before = view.selectedBot;
  view.selectedBot = id && state?.bots[id] ? id : null;
  if (view.selectedBot !== before && sfx) sfx.select(!!view.selectedBot);
  if (view.selectedBot) {
    const bot = state.bots[view.selectedBot];
    if (bot.floor !== view.currentFloor) setFloor(bot.floor, true);
    render();
    requestAnimationFrame(() => focusBot(view.selectedBot));
  } else {
    render();
  }
}

function setFloor(id, keepSelection = false) {
  if (!state?.floors.some((f) => f.id === id)) return;
  if (id !== view.currentFloor && sfx) {                 // the elevator's chime rings higher on higher floors
    const order = [...state.floors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).findIndex((f) => f.id === id);
    sfx.floor(order);
  }
  view.currentFloor = id;
  if (!keepSelection) view.selectedBot = null;
  try { localStorage.setItem('bothq.floor', id); } catch {}
  zoom('reset');
  render();
}

function pickDefaultFloor() {
  const fullest = () => [...state.floors].sort((a, b) => b.bots.length - a.bots.length)[0]?.id ?? null;
  let saved = null;
  try { saved = localStorage.getItem('bothq.floor'); } catch {}
  if (saved && state.floors.some((f) => f.id === saved)) return saved;
  return fullest();
}

function render() {
  if (!state || !renderScene) return;
  if (!view.currentFloor || !state.floors.some((f) => f.id === view.currentFloor)) view.currentFloor = pickDefaultFloor();
  if (view.selectedBot && !state.bots[view.selectedBot]) view.selectedBot = null;
  renderScene(state, view);
  renderUI(state, view);
  soundStatusChanges();
}

// A bot that just started waiting for you, failed or finished gets a short sound (one per batch, the most urgent).
// The first state is the baseline, so opening the page or replaying the channel's history stays quiet.
let lastStatus = null;
function soundStatusChanges() {
  const now = {};
  for (const [id, b] of Object.entries(state.bots)) now[id] = b.effective_status;
  if (lastStatus) {
    const fresh = new Set();
    for (const [id, s] of Object.entries(now)) if (lastStatus[id] && lastStatus[id] !== s) fresh.add(s);
    const kind = ['waiting_user', 'error', 'done'].find((k) => fresh.has(k));
    if (kind && sfx) sfx.status(kind);
  }
  lastStatus = now;
}

// The public pages host has no /api/state, so this fails and the lock stays. A local journal server answers
// with that journal's team, and only then is the office shown. A failed request never loads the sample roster.
async function probeJournal() {
  let res;
  try {
    res = await fetch('api/state', { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    return;
  }
  if (document.documentElement.dataset.gate !== 'locked') return;
  if (res.status === 401) { location.href = 'login'; return; }
  if (!res.ok) return;
  let data;
  try { data = await res.json(); } catch { return; }
  if (!data || typeof data !== 'object' || !data.bots || !data.floors) return;
  document.documentElement.dataset.gate = 'open';
  await loadOffice();
  state = withChairman(data);
  render();
  setTimeout(poll, POLL_MS);
}

async function poll() {
  try {
    const since = state && !state.demoLocal ? `?since=${state.version}` : '';
    const res = await fetch(`api/state${since}`, { cache: 'no-store', credentials: 'same-origin' });   // relative: works under a sub-path too
    if (res.status === 401) { location.href = 'login'; return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    if (!data.unchanged) { state = withChairman(data); render(); }
  } catch {
    // A missed poll keeps the last state. The bundled sample roster is never the fallback.
  }
  if (state && !state.demoLocal) setTimeout(poll, POLL_MS);
}

async function openFeed(channel) {
  const { feedFromHash, connectFeed } = await import('./feed.js');
  const feed = feedFromHash(channel.hash, channel.search ? `?${channel.search}` : '');
  if (!feed) {
    document.documentElement.dataset.gate = 'locked';
    return;
  }
  const ready = loadOffice();
  connectFeed(feed, (data) => {
    state = withChairman(data);
    ready.then(() => { if (renderScene) render(); }, () => {});
  });
  await ready;
}

async function openDemo() {
  await loadOffice();
  await startLocalDemo();
}

// ---------- local preview: ?demo=1 ----------

async function startLocalDemo() {
  const res = await fetch('./data/demo-state.json', { cache: 'no-store' });
  state = withChairman(await res.json());
  state.demoLocal = true;
  render();
  demoTimer = setInterval(simulate, 1600);
}

const STEPS = {
  working: ['scanning X, 7 searches', 'reading 40 fresh posts', 'drafting a thread', 'checking the numbers', 'compiling the report', 'drawing the cover', 'cross-checking sources'],
  waiting_user: ['waiting for your answer: publish?', 'need a budget OK', 'which option should we pick?'],
  error: ['X rate limit 429, retry in 15 min', "couldn't open the report file"],
  done: ['done: report sent', 'draft ready', 'task closed'],
  idle: ['waiting for a new task'],
};
const TASKS = ['Thread about AI agents for Monday', 'Covers for the post series', 'Weekly reach report',
  'Competitor post breakdown', 'Summary across all floors', 'Plan for the week'];
const NEXT = {
  working: [['working', 5], ['done', 3], ['waiting_user', 1], ['error', 0.5]],
  done: [['idle', 3], ['working', 2]],
  idle: [['working', 3], ['idle', 2]],
  waiting_user: [['working', 2], ['waiting_user', 2]],
  error: [['working', 2], ['error', 1]],
  stuck: [['working', 2], ['stuck', 2]],
};

function simulate() {
  const bots = Object.values(state.bots).filter((b) => !b.chairman);
  if (!bots.length) return;
  const bot = bots[Math.floor(Math.random() * bots.length)];
  const cur = bot.effective_status;
  const next = weighted(NEXT[cur] || NEXT.idle);
  const step = pickOne(STEPS[next] || STEPS.working);
  const now = new Date().toISOString();
  if (next !== cur) bot.since = now;
  bot.status = next;
  bot.effective_status = next;
  bot.step = step;
  bot.last_event = now;
  if (next === 'idle') bot.task = null;
  else if (!bot.task || /^tsk-/.test(bot.task)) bot.task = pickOne(TASKS);
  const today = (bot.today ||= { working_min: 0, events: 0, tasks_done: 0 });
  today.events++;
  if (next === 'done') today.tasks_done++;
  (today.hourly ||= new Array(24).fill(0))[new Date().getHours()]++;
  bot.history.unshift({ t: now, status: next, step });
  bot.history.length = Math.min(bot.history.length, 20);
  state.feed.unshift({ t: now, bot: bot.id, name: bot.name, status: next, step });
  state.feed.length = Math.min(state.feed.length, 100);
  recount();
  state.now = now;
  state.version++;
  render();
}

function recount() {
  const zero = () => ({ working: 0, idle: 0, waiting_user: 0, error: 0, stuck: 0, done: 0 });
  state.summary = { ...zero(), total: 0 };
  for (const f of state.floors) f.counts = zero();
  for (const b of Object.values(state.bots)) {
    const f = state.floors.find((x) => x.id === b.floor);
    if (f) f.counts[b.effective_status]++;
    if (b.chairman) continue;                              // the owner is not a bot status
    state.summary[b.effective_status]++;
    state.summary.total++;
  }
}

function weighted(list) {
  let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
