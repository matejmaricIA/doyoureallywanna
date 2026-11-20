// Bits shared by the pause page and the suggestion page.

import { displayUrl } from '../lib/domains.js';

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** The URL the page stands in for, from after the "#". Only http(s) is accepted. */
export function readTarget() {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Show the `.state` section with this name and hide the others. @param {string} name */
export function show(name) {
  for (const section of document.querySelectorAll('.state')) {
    /** @type {HTMLElement} */ (section).hidden = /** @type {HTMLElement} */ (section).dataset.state !== name;
  }
}

/**
 * Fill `node` with a sentence from lib/copy.js, the site name highlighted.
 * @param {HTMLElement} node
 * @param {string} template  contains "{site}" once
 * @param {string} site
 */
export function fillSentence(node, template, site) {
  const [before, after = ''] = template.split('{site}');
  const name = document.createElement('span');
  name.className = 'site';
  name.textContent = site;
  node.replaceChildren(before, name, after);
}

/**
 * The "nothing to do here" state, with a way on to the address if there is one.
 * @param {string | null} target
 */
export function showUnknown(target) {
  if (target) {
    const link = /** @type {HTMLAnchorElement} */ ($('continue'));
    link.href = target;
    link.textContent = `Continue to ${displayUrl(target, 40)}`;
    link.hidden = false;
  }
  show('unknown');
}

/** The "Your list & stats" link in the footer. */
export function wireFooter() {
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
}
