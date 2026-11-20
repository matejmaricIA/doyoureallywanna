// A minimal WebDriver BiDi client for Firefox, over Node's built-in
// WebSocket. Dev tooling only (the Firefox end-to-end test); none of this
// ships in the extension. No npm dependencies on purpose (D-011).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sleep, waitUntil } from './cdp.mjs';

const CANDIDATES = [
  process.env.FIREFOX,
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
  'C:/Program Files/Firefox Developer Edition/firefox.exe',
  'C:/Program Files/Firefox Nightly/firefox.exe',
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/usr/bin/firefox',
];

export function findFirefox() {
  const found = CANDIDATES.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('No Firefox found. Set FIREFOX=/path/to/firefox.');
  return found;
}

/**
 * Start a fresh Firefox with a throwaway profile and open a BiDi session.
 * @param {{ name: string, headless?: boolean, prefs?: Record<string, string | number | boolean> }} options
 */
export async function launchFirefox({ name, headless = true, prefs = {} }) {
  const profile = path.join(os.tmpdir(), `dyrw-profile-${name}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  writeFileSync(
    path.join(profile, 'user.js'),
    Object.entries(prefs)
      .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
      .join('\n'),
  );
  const child = spawn(
    findFirefox(),
    ['-no-remote', '-profile', profile, '--remote-debugging-port=0', ...(headless ? ['-headless'] : [])],
    // System access lets the test run scripts in moz-extension:// pages.
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } },
  );
  let log = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk) => (log += chunk));
  const endpoint = await waitUntil(() => log.match(/WebDriver BiDi listening on (ws:\/\/\S+)/)?.[1], {
    what: 'Firefox to start',
    timeout: 30_000,
  });
  const socket = new WebSocket(`${endpoint}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error(`Can't connect to ${endpoint}`)), { once: true });
  });
  const firefox = new Firefox(child, profile, socket);
  await firefox.send('session.new', { capabilities: {} });
  return firefox;
}

export class Firefox {
  #nextId = 0;
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void, method: string }>} */
  #pending = new Map();
  /** @type {Set<(message: any) => void>} */
  #listeners = new Set();

  /**
   * @param {import('node:child_process').ChildProcess} child
   * @param {string} profile
   * @param {WebSocket} socket
   */
  constructor(child, profile, socket) {
    this.child = child;
    this.profile = profile;
    this.socket = socket;
    this.exited = new Promise((resolve) => child.once('exit', resolve));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.type === 'error') pending?.reject(new Error(`${pending.method}: ${message.error}: ${message.message}`));
        else pending?.resolve(message.result);
      } else {
        for (const listener of this.#listeners) listener(message);
      }
    });
  }

  /** @param {string} method @param {object} [params] @returns {Promise<any>} */
  send(method, params = {}) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** @param {(message: any) => void} listener */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Install an unpacked extension for this session only. @param {string} dir */
  async installExtension(dir) {
    const { extension } = await this.send('webExtension.install', { extensionData: { type: 'path', path: dir } });
    return /** @type {string} */ (extension);
  }

  /** Every top-level tab, with its current URL. @returns {Promise<Array<{ context: string, url: string }>>} */
  async tabs() {
    const { contexts } = await this.send('browsingContext.getTree', { maxDepth: 0 });
    return contexts;
  }

  async newTab() {
    const { context } = await this.send('browsingContext.create', { type: 'tab' });
    return new Tab(this, context);
  }

  /** @param {string} context */
  tab(context) {
    return new Tab(this, context);
  }

  async close() {
    try {
      await Promise.race([this.send('browser.close'), sleep(3000)]);
    } catch {
      // Already gone.
    }
    await Promise.race([this.exited, sleep(5000)]);
    if (this.child.exitCode === null) this.child.kill();
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(this.profile, { recursive: true, force: true });
        return;
      } catch {
        await sleep(250);
      }
    }
  }
}

export class Tab {
  /** @param {Firefox} firefox @param {string} context */
  constructor(firefox, context) {
    this.firefox = firefox;
    this.context = context;
  }

  /**
   * Run an expression in the page and return its (awaited) value, passed
   * through JSON. Runs with user activation, like a click.
   * @param {string} expression
   */
  async evaluate(expression) {
    const result = await this.firefox.send('script.evaluate', {
      expression: `(async () => JSON.stringify(await (${expression})))()`,
      target: { context: this.context },
      awaitPromise: true,
      userActivation: true,
    });
    if (result.type === 'exception') throw new Error(result.exceptionDetails.text);
    return result.result.type === 'string' ? JSON.parse(result.result.value) : undefined;
  }

  /** @param {string} selector */
  click(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  /**
   * A real mouse click in the middle of the element: trusted input, the way
   * a person clicks. Unlike click(), it counts as "handling user input" for
   * Firefox's permission prompts. The tab must be the one in front.
   * @param {string} selector
   */
  async realClick(selector) {
    const [x, y] = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    const pointer = [{ type: 'pointerMove', x, y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }];
    await this.firefox.send('input.performActions', {
      context: this.context,
      actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: pointer }],
    });
    await this.firefox.send('input.releaseActions', { context: this.context });
  }

  /** @param {string} selector */
  text(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`);
  }

  async url() {
    const { contexts } = await this.firefox.send('browsingContext.getTree', { root: this.context, maxDepth: 0 });
    return /** @type {string} */ (contexts[0].url);
  }

  /** Start loading `url` and return right away (the extension may redirect it). @param {string} url */
  navigate(url) {
    return this.firefox.send('browsingContext.navigate', { context: this.context, url, wait: 'none' });
  }

  async settle() {
    await waitUntil(() => this.evaluate('document.readyState === "complete"'), { what: 'page load' });
  }
}
