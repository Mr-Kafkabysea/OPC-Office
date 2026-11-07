// List avatars for the office sidebar and Status check.
// Same pre-rendered jelly blobs as grokbot-wallpaper: assets/blobs/thumbs/<id>.png when a bot has a
// hand-made model, otherwise assets/blobs/lib/<shape>-<HEX>.png from its look (shape + nearest app colour;
// sphere + stem is the app's 14th picture). Initials are not decided here. The UI shows them only after
// every candidate image has failed.
//
// Where the files are, relative to this module (web/lib/avatars.js, or lib/avatars.js once published):
//   repo tree web/<dir>/<file>.js     -> ../../assets   (a server that exposes the repo at /web/)
//   published <project>/<dir>/<file>  -> ../assets      (GitHub Pages site root, and the local server
//                                                         that serves web/ at /)
// Two levels up from <project>/ui/ui.js leaves the project (github.io/assets, which 404s).

export function assetUrl(rel, moduleUrl = import.meta.url) {
  const base = new URL(moduleUrl);
  const inRepoTree = /\/web\/[^/]+\/[^/]+$/.test(base.pathname);
  const prefix = inRepoTree ? '../../' : '../';
  return new URL(prefix + String(rel).replace(/^\/+/, ''), base).href;
}

// Shapes = web/scene/looks.js SHAPES (13 app shapes, then 3 older ids). Colours = the app palette
// (blobgen APP_COLORS). sphere + stem has its own picture.
const LIB_SHAPES = ['sphere', 'cloud', 'rounded_square', 'star4', 'clover', 'bubble', 'flower', 'drop', 'pill', 'triangle', 'pentagon', 'star6', 'hexagon', 'rounded_cube', 'cone', 'trio'];
const LIB_COLORS = ['000000', 'A06B39', 'FB2B3E', 'FD690F', 'F59312', '14C16F', '13B7A2', '1E86FC', '8F59F9', 'F93498', '959595'];

function fnv(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Library PNG for this bot's look. A missing look uses the same hash the office blob uses. */
export function libThumbUrl(bot, moduleUrl = import.meta.url) {
  const libBase = assetUrl('assets/blobs/lib/', moduleUrl);
  const id = String(bot?.id || bot?.name || '');
  const look = bot?.look || {};
  let shape = LIB_SHAPES.includes(look.shape) ? look.shape : LIB_SHAPES[(fnv(`shape:${id}`) >>> 4) % 13];
  if (shape === 'sphere' && look.accessory === 'stem') shape = 'sphere_stem';
  const m = /^#([0-9a-f]{6})$/i.exec(look.color || bot?.color || '');
  let hex = LIB_COLORS[fnv(`color:${id}`) % 10];
  if (m) {                                               // nearest by weighted RGB; greys go to the app's black or gray
    const rgb = (x) => [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)), [r, g, b] = rgb(m[1]);
    let best = Infinity;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 28) { hex = (r + g + b) / 3 < 75 ? '000000' : '959595'; best = 0; }
    for (const p of LIB_COLORS) {
      const [pr, pg, pb] = rgb(p), rm = (r + pr) / 2, d = (2 + rm / 256) * (r - pr) ** 2 + 4 * (g - pg) ** 2 + (3 - rm / 256) * (b - pb) ** 2;
      if (d < best) { best = d; hex = p; }
    }
  }
  return `${libBase}${shape}-${hex}.png`;
}

/** Image URLs to try, in order. A hand-made model gets its named thumb first; the library blob is always next.
 *  Channel bots are marked has_glb false (there is no named file), so they go straight to the library. */
export function avatarSources(bot, moduleUrl = import.meta.url) {
  const name = bot?.avatar || bot?.id || '';
  const sources = [];
  if (name && bot?.has_glb !== false) {
    sources.push(`${assetUrl('assets/blobs/thumbs/', moduleUrl)}${encodeURIComponent(name)}.png`);
  }
  sources.push(libThumbUrl(bot, moduleUrl));
  return sources;
}

/** The following candidate after `index` failed to load. src null means the UI may show initials. */
export function nextAvatarSource(sources, index) {
  const next = (Number(index) || 0) + 1;
  if (!Array.isArray(sources) || next >= sources.length || !sources[next]) return { index: next, src: null };
  return { index: next, src: sources[next] };
}
