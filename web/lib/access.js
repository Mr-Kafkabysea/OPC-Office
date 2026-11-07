// Who may see the office. The channel in the link is the password (PROMPT.md: site root + # + topic).
// A bare visit stays locked. A channel this browser already opened is put back in the address bar
// before the office opens, so the private link is still the way in. ?demo=1 is a local preview.
import { baseTag, feedFromLink } from './feedbase.js';

export const CHANNEL_KEY = 'bothq.channel';

function paramsOf(search) {
  const s = search || '';
  return new URLSearchParams(s.startsWith('?') || s === '' ? s : `?${s}`);
}

/** { hash, search } with no leading '?'. Null when the link names no channel. A bare ?feed=<topic>
 *  becomes #<topic> so the address bar carries the same suffix as a new link. */
export function channelFromLocation({ hash = '', search = '' } = {}) {
  const params = paramsOf(search);
  const kept = new URLSearchParams();
  const feed = params.get('feed');
  if (feed && /[./:]/.test(feed)) kept.set('feed', feed);
  const searchOut = kept.toString();
  const withSearch = searchOut ? `?${searchOut}` : '';
  let nextHash = hash || '';
  if (!feedFromLink({ hash: nextHash, search: withSearch })) {
    const parsed = feedFromLink({ hash, search: withSearch || (params.get('feed') ? `?feed=${encodeURIComponent(params.get('feed'))}` : '') });
    if (!parsed) return null;
    const tag = baseTag(parsed.base);
    nextHash = `#${parsed.topic}${tag ? `@${tag}` : ''}`;
  }
  if (!feedFromLink({ hash: nextHash, search: withSearch })) return null;
  return { hash: nextHash, search: searchOut };
}

function savedChannel(saved) {
  if (!saved || typeof saved.hash !== 'string' || typeof saved.search !== 'string') return null;
  return channelFromLocation(saved);
}

/** 'feed' | 'restore' | 'demo' | 'locked'. restore still needs the hash written into the address bar. */
export function officeAccess(loc = {}, saved = null) {
  const hash = loc.hash || '';
  const search = loc.search || '';
  const params = paramsOf(search);
  if (params.get('demo') === '1') return { mode: 'demo' };
  const channel = channelFromLocation({ hash, search });
  if (channel) return { mode: 'feed', channel };
  if (!hash && !params.has('feed')) {
    const restored = savedChannel(saved);
    if (restored) return { mode: 'restore', channel: restored };
  }
  return { mode: 'locked' };
}

/** '?feed=host#topic' or '#topic'. */
export function channelSuffix(channel) {
  const search = channel.search ? (channel.search.startsWith('?') ? channel.search : `?${channel.search}`) : '';
  return `${search}${channel.hash}`;
}

/** The decision for this page, plus an href to put in the address bar when the hash is not there yet.
 *  href null means the bar already has the channel, or the page stays locked / on the local demo. */
export function entryLocation(pathname, loc = {}, saved = null) {
  const access = officeAccess(loc, saved);
  if (!access.channel) return { access, href: null };
  const hash = loc.hash || '';
  const href = `${pathname}${channelSuffix(access.channel)}`;
  return {
    access: { mode: 'feed', channel: access.channel },
    href: hash === access.channel.hash ? null : href,
  };
}
