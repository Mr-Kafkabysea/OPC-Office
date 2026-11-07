// Glue: polls /api/state (CONTRACT §4), keeps the view (floor, selection), feeds the scene and the UI.
// With #<topic> in the link it reads the user's bots from their channel instead (feed.js, lib/feedbase.js): no server.
// Without either (static preview) it runs on web/data/demo-state.json with a local simulation.
import { initScene, renderScene, zoom, focusBot } from './scene/scene.js';
import { initSound, sfx } from './audio/sound.js';
import { withChairman } from './lib/executive.js';
import { initUI, renderUI } from './ui/ui.js';

const POLL_MS = 1000;
const view = { currentFloor: null, selectedBot: null };
let state = null;
let demoTimer = null;

const params = new URLSearchParams(location.search);

initScene(document.getElementById('scene'), {
  onSelectBot: (id) => select(id),
  onHoverBot: (id) => sfx.hover(id),
});

initUI({
  onSelectBot: (id) => select(id),
  onSelectFloor: (id) => setFloor(id),
  onZoom: (dir) => { zoom(dir); sfx.zoom(dir); },
  onOpenChat: (id, url) => { if (url) location.href = url; },
});

initSound({ slot: document.querySelector('#topbar .bhq-right') });

addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

function select(id) {
  const before = view.selectedBot;
  view.selectedBot = id && state?.bots[id] ? id : null;
  if (view.selectedBot !== before) sfx.select(!!view.selectedBot);
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
  if (id !== view.currentFloor) {                        // the elevator's chime rings higher on higher floors
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
  if (!state) return;
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
    if (kind) sfx.status(kind);
  }
  lastStatus = now;
}

// ---------- live polling ----------

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
    if (!state) await startLocalDemo();
    if (state?.demoLocal) return;          // static preview: no server, stop polling
  }
  setTimeout(poll, POLL_MS);
}

// ---------- the user's own bots: #<topic> ----------

const { feedFromLink } = await import('./lib/feedbase.js');
const channelKey = 'bothq.channel';
let channel = null;
if (params.get('demo') !== '1') {
  if (feedFromLink(location)) {
    const search = new URLSearchParams();
    if (params.has('feed')) search.set('feed', params.get('feed'));
    channel = { hash: location.hash, search: search.toString() };
    try { localStorage.setItem(channelKey, JSON.stringify(channel)); } catch {}
  } else if (!location.hash && !params.has('feed')) {
    try {
      const saved = JSON.parse(localStorage.getItem(channelKey));
      if (saved && typeof saved.hash === 'string' && typeof saved.search === 'string' && feedFromLink(saved)) channel = saved;
    } catch {}
  }
}

addEventListener('hashchange', () => location.reload());
if (channel) {
  const { feedFromHash, connectFeed } = await import('./feed.js');
  connectFeed(feedFromHash(channel.hash, channel.search), (data) => { state = withChairman(data); render(); });
} else if (params.get('demo') === '1') {
  startLocalDemo();
} else {
  poll();
}

// ---------- static preview: local simulation ----------

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
