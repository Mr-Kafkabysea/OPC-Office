import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANNEL_KEY, channelSuffix, entryLocation, officeAccess } from '../../web/lib/access.js';
import { feedFromLink } from '../../web/lib/feedbase.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const saved = { hash: '#gbw-abcdef123', search: '' };

test('a bare visit stays locked and does not become the sample office', () => {
  assert.deepEqual(entryLocation('/OPC-Office/', { hash: '', search: '' }, null), {
    access: { mode: 'locked' }, href: null,
  });
  assert.equal(officeAccess({ hash: '#short' }).mode, 'locked');
  assert.equal(officeAccess({ search: '?feed=relay.example.com' }).mode, 'locked');
  assert.equal(entryLocation('/OPC-Office/', { hash: '#short', search: '' }, saved).access.mode, 'locked');
  assert.equal(officeAccess({ hash: '', search: '' }, { hash: '#nope', search: '' }).mode, 'locked');
  assert.equal(officeAccess({ hash: '', search: '' }, { nope: true }).mode, 'locked');
  for (const plan of [
    entryLocation('/OPC-Office/', { hash: '', search: '' }, null),
    entryLocation('/OPC-Office/', { hash: '#gbw-abcdef123', search: '' }, null),
    entryLocation('/OPC-Office/', { hash: '', search: '' }, saved),
  ]) {
    assert.notEqual(plan.access.mode, 'demo');
  }
});

test('a #topic link opens that channel and leaves the address bar alone', () => {
  const plan = entryLocation('/OPC-Office/', { hash: '#gbw-abcdef123', search: '' }, saved);
  assert.equal(plan.access.mode, 'feed');
  assert.deepEqual(plan.access.channel, { hash: '#gbw-abcdef123', search: '' });
  assert.equal(plan.href, null);
  assert.equal(feedFromLink(plan.access.channel).url, 'https://ntfy.sh/gbw-abcdef123');

  const relay = entryLocation('/OPC-Office/', { hash: '#gbw-abcdef123', search: '?feed=relay.0xcodila.com' }, null);
  assert.equal(relay.href, null);
  assert.equal(relay.access.channel.search, 'feed=relay.0xcodila.com');
  assert.equal(feedFromLink({ hash: relay.access.channel.hash, search: `?${relay.access.channel.search}` }).url, 'https://relay.0xcodila.com/gbw-abcdef123');

  const older = '#gbw-abcdef123&ntfy=https%3A%2F%2Fntfy.example.org';
  assert.equal(officeAccess({ hash: older }).channel.hash, older);
  assert.equal(entryLocation('/p/', { hash: older, search: '' }).href, null);

  const at = officeAccess({ hash: '#gbw-abcdef123@relay.0xcodila.com' });
  assert.equal(at.channel.hash, '#gbw-abcdef123@relay.0xcodila.com');
  assert.equal(feedFromLink(at.channel).url, 'https://relay.0xcodila.com/gbw-abcdef123');

  const switched = officeAccess({ hash: '#gbw-zzzzzz999' }, saved);
  assert.equal(switched.mode, 'feed');
  assert.equal(switched.channel.hash, '#gbw-zzzzzz999');
});

test('a remembered channel is written back as the # suffix before the office opens', () => {
  const plan = entryLocation('/OPC-Office/', { hash: '', search: '' }, saved);
  assert.equal(plan.access.mode, 'feed');
  assert.equal(plan.href, '/OPC-Office/#gbw-abcdef123');
  assert.equal(channelSuffix(plan.access.channel), '#gbw-abcdef123');

  const legacy = entryLocation('/OPC-Office/', { hash: '', search: '?feed=gbw-abcdef123' }, null);
  assert.equal(legacy.access.mode, 'feed');
  assert.equal(legacy.href, '/OPC-Office/#gbw-abcdef123');
  assert.equal(legacy.access.channel.search, '');

  const relay = entryLocation('/', { hash: '', search: '' }, { hash: '#gbw-abcdef123', search: 'feed=relay.0xcodila.com' });
  assert.equal(relay.href, '/?feed=relay.0xcodila.com#gbw-abcdef123');
  assert.equal(officeAccess({ search: '?feed=relay.example.com' }, saved).mode, 'locked');
});

test('?demo=1 is the only path that asks for the bundled sample', () => {
  const demo = entryLocation('/OPC-Office/', { hash: '', search: '?demo=1' }, saved);
  assert.equal(demo.access.mode, 'demo');
  assert.equal(demo.href, null);
  assert.equal(officeAccess({ hash: '#gbw-abcdef123', search: '?demo=1' }).mode, 'demo');

  const app = read('web/app.js');
  assert.match(app, /entryLocation/);
  assert.doesNotMatch(app, /if \(!state\) await startLocalDemo\(\)/);
  assert.equal([...app.matchAll(/demo-state\.json/g)].length, 1);
  assert.match(app, /connectFeed/);
  assert.equal(CHANNEL_KEY, 'bothq.channel');
});

test('the locked page does not carry the sample roster or preload the office', () => {
  const html = read('web/index.html');
  const demo = JSON.parse(read('web/data/demo-state.json'));
  const names = [...new Set(Object.values(demo.bots).map((b) => b.name))];
  assert.ok(names.length > 5);
  const surface = html + read('web/app.js') + read('web/lib/access.js');
  for (const name of names) assert.equal(surface.includes(name), false, name);
  assert.match(html, /Private office/);
  assert.match(html, /works like a password/);
  assert.match(html, /localStorage\.getItem\('bothq\.channel'\)/);
  assert.doesNotMatch(html, /<link rel="(?:module)?preload"/);
});

test('public copy requires the private hashed link', () => {
  const readme = read('README.md');
  const prompt = read('PROMPT.md');
  assert.match(readme, /works like a password/);
  assert.match(readme, /without that `#` suffix stays locked/);
  assert.doesNotMatch(readme, /opens the dashboard directly/);
  assert.doesNotMatch(readme, /sees demo data/);
  assert.match(readme, /developing the page locally/);
  assert.match(prompt, /works like a password/);
  assert.match(prompt, /without that `#` suffix does not show the office/);
  assert.match(prompt, /The site without the # channel does not open the office/);
});

test('old /office/ links keep search and hash', () => {
  const build = read('scripts/build-pages.mjs');
  assert.match(build, /location\.replace\('\.\.\/' \+ location\.search \+ location\.hash\)/);
  const redirected = (pageUrl) => {
    const u = new URL(pageUrl);
    return new URL(`../${u.search}${u.hash}`, u).href;
  };
  assert.equal(
    redirected('https://mr-kafkabysea.github.io/OPC-Office/office/#gbw-abcdef123'),
    'https://mr-kafkabysea.github.io/OPC-Office/#gbw-abcdef123',
  );
  assert.equal(
    redirected('https://mr-kafkabysea.github.io/OPC-Office/office/index.html?feed=relay.example.com#gbw-abcdef123'),
    'https://mr-kafkabysea.github.io/OPC-Office/?feed=relay.example.com#gbw-abcdef123',
  );
  assert.equal(
    redirected('https://mr-kafkabysea.github.io/OPC-Office/office/'),
    'https://mr-kafkabysea.github.io/OPC-Office/',
  );
});
