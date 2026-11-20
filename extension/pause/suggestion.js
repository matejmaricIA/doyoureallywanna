// The suggestion page (D-021, D-022). The service worker sends a tab here
// when a site that isn't on your list looks like a habit. The site has
// already started to open behind it; every answer goes back to it.
//
// Unlike the pause page this one isn't web-accessible, so websites can't
// open it to put words in the extension's mouth.

import { allowTemporarily, requestAccess, syncRules } from '../lib/browser.js';
import { SUGGESTION } from '../lib/copy.js';
import { displayUrl } from '../lib/domains.js';
import { addQuiet, addSite, load } from '../lib/store.js';
import { siteOfUrl } from '../lib/suggest.js';
import { $, fillSentence, readTarget, show, showUnknown, wireFooter } from './common.js';

const BUTTONS = ['add', 'quiet', 'let-in'];

/** @param {boolean} busy */
function setBusy(busy) {
  for (const id of BUTTONS) /** @type {HTMLButtonElement} */ ($(id)).disabled = busy;
}

function start() {
  wireFooter();
  $('nothing').textContent = SUGGESTION.nothing;

  const target = readTarget();
  const site = target ? siteOfUrl(target) : null;
  if (!target || !site) return showUnknown(target);

  document.title = SUGGESTION.title.replace('{site}', site);
  // Two sentences, each on its own line.
  fillSentence($('question'), SUGGESTION.noticed, site);
  const question = document.createElement('span');
  question.className = 'line';
  question.textContent = SUGGESTION.question;
  $('question').append(' ', question);
  $('why').textContent = SUGGESTION.why;
  $('add').textContent = SUGGESTION.add;
  $('quiet').textContent = SUGGESTION.quiet;
  $('let-in').textContent = SUGGESTION.letIn;
  $('target').textContent = displayUrl(target);
  $('target').title = target;
  show('suggest');

  $('add').addEventListener('click', () => addToList(site, target));
  $('quiet').addEventListener('click', async () => {
    setBusy(true);
    await addQuiet(site);
    continueTo(target);
  });
  $('let-in').addEventListener('click', () => {
    setBusy(true);
    continueTo(target);
  });
}

/**
 * Put the site on the list, the same way the popup does, then let this one
 * open through like a "Yes" (D-021): the list asks from the next time on.
 * @param {string} site
 * @param {string} target
 */
async function addToList(site, target) {
  setBusy(true);
  $('error').hidden = true;
  // Ask first, while the click still counts as one.
  const granted = await requestAccess([site]);
  if (!granted) {
    $('error').textContent = SUGGESTION.noAccess.replace('{site}', site);
    $('error').hidden = false;
    setBusy(false);
    return;
  }
  await addSite(site);
  await syncRules();
  try {
    const [{ settings }, tab] = await Promise.all([load(), chrome.tabs.getCurrent()]);
    if (tab?.id !== undefined) await allowTemporarily(tab.id, site, settings.graceMinutes);
  } catch (error) {
    console.error('Could not set up the grace period', error);
  }
  continueTo(target);
}

/**
 * Back to the page that already opened: usually instant, from the
 * back/forward cache. Going back is never counted as an open, so this
 * can't bring the suggestion back.
 * @param {string} target
 */
function continueTo(target) {
  if (navigation.canGoBack) history.back();
  else location.replace(target);
}

start();
