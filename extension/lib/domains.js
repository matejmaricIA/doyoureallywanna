// Pure helpers for turning a URL or whatever the user typed into the
// hostname we store ("reddit.com"), and for matching URLs against the list.
// No `chrome.*` here, so it runs in unit tests as-is.

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normalize user input or a URL into a bare hostname like "reddit.com".
 * Strips scheme, credentials, port, path and a leading "www." or "*.".
 * Returns null when the input can't be a website we can pause.
 * @param {unknown} input
 * @returns {string | null}
 */
export function normalizeDomain(input) {
  if (typeof input !== 'string') return null;
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (text.startsWith('*.')) text = text.slice(2);
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `http://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  let host = url.hostname.replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!isValidHost(host)) return null;
  return host;
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isValidHost(host) {
  if (!host || host.length > 253 || IPV4.test(host) || host.startsWith('[')) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (/^\d+$/.test(labels[labels.length - 1])) return false;
  return labels.every((label) => LABEL.test(label));
}

/**
 * Hostname of an http(s) URL, or null for anything else (edge://, file://, ...).
 * @param {string | undefined | null} url
 * @returns {string | null}
 */
export function hostOf(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
}

/**
 * Does `host` belong to the listed `domain`? Subdomains count:
 * "music.youtube.com" belongs to "youtube.com".
 * @param {string} host
 * @param {string} domain
 */
export function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Which listed site does this URL belong to? The most specific one wins,
 * so with both "google.com" and "mail.google.com" listed, Gmail matches
 * "mail.google.com".
 * @param {string} url
 * @param {Iterable<string>} domains
 * @returns {string | null}
 */
export function findSiteForUrl(url, domains) {
  const host = hostOf(url);
  if (!host) return null;
  let best = null;
  for (const domain of domains) {
    if (hostMatches(host, domain) && (!best || domain.length > best.length)) best = domain;
  }
  return best;
}

/**
 * The host permission pattern we request for a listed site. "*." also
 * matches the bare domain itself.
 * @param {string} domain
 */
export function originPatternFor(domain) {
  return `*://*.${domain}/*`;
}

/**
 * Short, readable version of a URL for display: no scheme, no "www.",
 * no trailing slash, truncated in the middle if it's long.
 * @param {string} url
 * @param {number} [max]
 */
export function displayUrl(url, max = 70) {
  let text = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  if (text.length > max) {
    const head = Math.ceil((max - 1) * 0.6);
    const tail = max - 1 - head;
    text = `${text.slice(0, head)}…${text.slice(-tail)}`;
  }
  return text;
}
