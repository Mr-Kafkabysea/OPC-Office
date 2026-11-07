import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assetUrl, avatarSources, nextAvatarSource } from '../../web/lib/avatars.js';

const exec = promisify(execFile);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

// A bot that has a look and no hand-made model. Not a roster entry: the office still takes staff from the channel.
const looked = {
  id: 'placeholder-bot',
  name: 'Placeholder',
  has_glb: false,
  look: { shape: 'clover', color: '#fd690f', accessory: 'none' },
};
const PAGES_UI = 'https://example.github.io/OPC-Office/ui/ui.js';
const LIB = 'https://example.github.io/OPC-Office/assets/blobs/lib/clover-FD690F.png';

test('a look with no named thumb resolves to the library blob inside the project site', () => {
  const pages = avatarSources(looked, PAGES_UI);
  assert.deepEqual(pages, [LIB]);
  assert.equal(new URL(pages[0]).pathname, '/OPC-Office/assets/blobs/lib/clover-FD690F.png');
  // The old module-relative path steps out of the project and 404s at the host root.
  assert.equal(new URL('../../assets/blobs/lib/clover-FD690F.png', PAGES_UI).href, 'https://example.github.io/assets/blobs/lib/clover-FD690F.png');

  const local = 'http://127.0.0.1:4173/ui/ui.js';
  assert.equal(avatarSources(looked, local)[0], 'http://127.0.0.1:4173/assets/blobs/lib/clover-FD690F.png');

  const repoModule = pathToFileURL(path.join(repo, 'web', 'ui', 'ui.js')).href;
  assert.equal(fileURLToPath(avatarSources(looked, repoModule)[0]), path.join(repo, 'assets', 'blobs', 'lib', 'clover-FD690F.png'));
  assert.equal(existsSync(fileURLToPath(avatarSources(looked, repoModule)[0])), true);
});

test('sphere plus stem uses the library picture, and a missing named thumb falls through to it', () => {
  const stem = avatarSources({
    id: 'placeholder-bot',
    has_glb: false,
    look: { shape: 'sphere', color: '#FD690F', accessory: 'stem' },
  }, PAGES_UI);
  assert.deepEqual(stem, ['https://example.github.io/OPC-Office/assets/blobs/lib/sphere_stem-FD690F.png']);

  const handmade = {
    id: 'placeholder-bot',
    avatar: 'placeholder-bot',
    has_glb: true,
    look: { shape: 'clover', color: '#FD690F', accessory: 'none' },
  };
  const sources = avatarSources(handmade, PAGES_UI);
  assert.deepEqual(sources, [
    'https://example.github.io/OPC-Office/assets/blobs/thumbs/placeholder-bot.png',
    LIB,
  ]);
  assert.deepEqual(nextAvatarSource(sources, 0), { index: 1, src: LIB });
  assert.deepEqual(nextAvatarSource(sources, 1), { index: 2, src: null });

  // An upstream demo id still prefers its named thumb. The library is the second try.
  const demo = avatarSources({ id: 'grok-bot', avatar: 'grok-bot', look: { shape: 'sphere', color: '#FD690F', accessory: 'stem' } }, PAGES_UI);
  assert.equal(demo[0], 'https://example.github.io/OPC-Office/assets/blobs/thumbs/grok-bot.png');
  assert.equal(demo[1], 'https://example.github.io/OPC-Office/assets/blobs/lib/sphere_stem-FD690F.png');
});

test('a look with no named file still picks a library image when the colour is off the palette', () => {
  const [src] = avatarSources({
    id: 'placeholder-bot',
    has_glb: false,
    look: { shape: 'rounded_cube', color: '#3D4F6F', accessory: 'glasses' },
  }, pathToFileURL(path.join(repo, 'web', 'lib', 'avatars.js')).href);
  const file = fileURLToPath(src);
  assert.match(path.basename(file), /^rounded_cube-[0-9A-F]{6}\.png$/);
  assert.equal(existsSync(file), true);
  assert.equal(file.startsWith(path.join(repo, 'assets', 'blobs', 'lib') + path.sep), true);
});

test('the list UI asks the shared picker, and channel bots are not given hand-made thumbs', () => {
  const ui = read('web/ui/ui.js');
  assert.match(ui, /avatarSources\(bot\)/);
  assert.match(ui, /nextAvatarSource\(img\._sources/);
  assert.match(ui, /from '\.\.\/lib\/avatars\.js'/);
  assert.doesNotMatch(ui, /new URL\('\.\.\/\.\.\/assets\//);
  assert.match(read('web/share/share.js'), /assetUrl\('assets\/brand\/logo-mark\.png', import\.meta\.url\)/);
  const feed = read('web/feed.js');
  assert.match(feed, /const HANDMADE = new Set\(\)/);
  assert.match(feed, /hasAvatar: \(id\) => HANDMADE\.has\(id\)/);
  assert.equal(assetUrl('assets/blobs/lib/', 'https://example.github.io/OPC-Office/share/share.js'), 'https://example.github.io/OPC-Office/assets/blobs/lib/');
});

test('a GitHub Pages build keeps list avatars under the project, not the host root', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'opc-pages-'));
  try {
    await exec(process.execPath, ['scripts/build-pages.mjs', out], { cwd: repo });
    const built = pathToFileURL(path.join(out, 'lib', 'avatars.js')).href;
    const mod = await import(built);
    const [src] = mod.avatarSources(looked);
    assert.equal(fileURLToPath(src), path.join(out, 'assets', 'blobs', 'lib', 'clover-FD690F.png'));
    assert.equal(existsSync(fileURLToPath(src)), true);
    assert.equal(mod.avatarSources(looked, PAGES_UI)[0], LIB);
    const ui = readFileSync(path.join(out, 'ui', 'ui.js'), 'utf8');
    assert.match(ui, /from '\.\.\/lib\/avatars\.js'/);
    assert.match(ui, /avatarSources\(bot\)/);
    assert.doesNotMatch(ui, /new URL\('\.\.\/\.\.\/assets\//);
    const named = mod.avatarSources({ id: 'grok-bot', avatar: 'grok-bot', has_glb: true }, PAGES_UI)[0];
    assert.equal(named, 'https://example.github.io/OPC-Office/assets/blobs/thumbs/grok-bot.png');
    assert.equal(existsSync(path.join(out, 'assets', 'blobs', 'thumbs', 'grok-bot.png')), true);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
