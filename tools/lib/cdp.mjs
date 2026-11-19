// A minimal Chrome DevTools Protocol client, talking to Edge or Chrome over
// --remote-debugging-pipe. Dev tooling only (tests, screenshots, icons);
// none of this ships in the extension. No npm dependencies on purpose.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export function findBrowser() {
  const found = CANDIDATES.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('No Edge or Chrome found. Set BROWSER=/path/to/browser.');
  return found;
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `check` returns something truthy.
 * @template T
 * @param {() => T | Promise<T>} check
 * @param {{ timeout?: number, interval?: number, what?: string }} [options]
 * @returns {Promise<T>}
 */
export async function waitUntil(check, { timeout = 10_000, interval = 100, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  const detail = last instanceof Error ? ` (last error: ${last.message})` : ` (last value: ${JSON.stringify(last)})`;
  throw new Error(`Timed out waiting for ${what}${detail}`);
}

/**
 * Delete a folder, retrying while the browser's helper processes still hold
 * files in it (Windows). Returns false if it's still there; that's harmless
 * for a temp folder, and the next run of the same tool tries again.
 * @param {string} dir
 */
async function removeDir(dir) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      await sleep(250);
    }
  }
  return false;
}

/**
 * Start a fresh browser with a throwaway profile. Each tool uses its own
 * fixed profile folder (dyrw-profile-<name> in the temp folder), wiped at
 * start and at close, so failed cleanups never pile up.
 * @param {{ name: string, headless?: boolean, args?: string[] }} options
 */
export async function launch({ name, headless = true, args = [] }) {
  const userDataDir = path.join(os.tmpdir(), `dyrw-profile-${name}`);
  if (!(await removeDir(userDataDir))) throw new Error(`Profile folder is in use: ${userDataDir}`);
  mkdirSync(userDataDir, { recursive: true });
  const child = spawn(
    findBrowser(),
    [
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      ...(headless ? ['--headless'] : []),
      ...args,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  return new Browser(child, userDataDir);
}

export class Browser {
  #nextId = 0;
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void, method: string }>} */
  #pending = new Map();
  /** @type {Set<(message: any) => void>} */
  #listeners = new Set();
  #buffer = '';

  /**
   * @param {import('node:child_process').ChildProcess} child
   * @param {string} userDataDir
   */
  constructor(child, userDataDir) {
    this.child = child;
    this.userDataDir = userDataDir;
    this.input = /** @type {import('node:stream').Writable} */ (child.stdio[3]);
    const output = /** @type {import('node:stream').Readable} */ (child.stdio[4]);
    output.setEncoding('utf8');
    output.on('data', (chunk) => this.#onData(chunk));
    this.exited = new Promise((resolve) => child.once('exit', resolve));
  }

  /** @param {string} chunk */
  #onData(chunk) {
    this.#buffer += chunk;
    let end;
    while ((end = this.#buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(this.#buffer.slice(0, end));
      this.#buffer = this.#buffer.slice(end + 1);
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error) pending?.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending?.resolve(message.result);
      } else {
        for (const listener of this.#listeners) listener(message);
      }
    }
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId]
   * @returns {Promise<any>}
   */
  send(method, params = {}, sessionId) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.input.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }

  /** @param {(message: any) => void} listener */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** @param {string} dir  absolute path to an unpacked extension */
  async loadExtension(dir) {
    const { id } = await this.send('Extensions.loadUnpacked', { path: dir });
    return /** @type {string} */ (id);
  }

  /** @returns {Promise<Array<{ targetId: string, type: string, url: string }>>} */
  async targets() {
    return (await this.send('Target.getTargets')).targetInfos;
  }

  /** @param {string} [url] @param {{ newWindow?: boolean }} [options] */
  async newPage(url = 'about:blank', { newWindow = false } = {}) {
    const { targetId } = await this.send('Target.createTarget', { url, newWindow });
    return this.attach(targetId);
  }

  /** @param {string} targetId */
  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }

  async close() {
    try {
      await Promise.race([this.send('Browser.close'), sleep(3000)]);
    } catch {
      // Already gone.
    }
    await Promise.race([this.exited, sleep(5000)]);
    if (this.child.exitCode === null) this.child.kill();
    await removeDir(this.userDataDir);
  }
}

export class Page {
  /**
   * @param {Browser} browser
   * @param {string} targetId
   * @param {string} sessionId
   */
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  /** @param {string} method @param {object} [params] */
  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  /**
   * Run an expression in the page and return its (awaited) value.
   * @param {string} expression
   * @param {{ userGesture?: boolean }} [options]
   */
  async evaluate(expression, { userGesture = false } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture,
    });
    if (result.exceptionDetails) {
      const { exception, text } = result.exceptionDetails;
      throw new Error(exception?.description ?? text);
    }
    return result.result.value;
  }

  /** Click an element the way a person would (counts as a user gesture). @param {string} selector */
  click(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`, { userGesture: true });
  }

  /** @param {string} selector */
  text(selector) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`);
  }

  async url() {
    const { targetInfo } = await this.browser.send('Target.getTargetInfo', { targetId: this.targetId });
    return /** @type {string} */ (targetInfo.url);
  }

  /** @param {string} url */
  navigate(url) {
    return this.send('Page.navigate', { url });
  }

  /** Wait for the document to finish loading and be painted. */
  async settle() {
    await waitUntil(() => this.evaluate('document.readyState === "complete"'), { what: 'page load' });
    await this.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  }

  /**
   * @param {{ width: number, height: number, scale?: number, dark?: boolean }} viewport
   */
  async setViewport({ width, height, scale = 1, dark = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
    });
  }

  /**
   * @param {string} file
   * @param {{ fullPage?: boolean, clip?: { x: number, y: number, width: number, height: number } }} [options]
   */
  async screenshot(file, { fullPage = false, clip } = {}) {
    let area = clip;
    if (!area && fullPage) {
      const { cssContentSize } = await this.send('Page.getLayoutMetrics');
      area = { x: 0, y: 0, width: cssContentSize.width, height: Math.ceil(cssContentSize.height) };
    }
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
      ...(area ? { clip: { ...area, scale: 1 } } : {}),
    });
    writeFileSync(file, Buffer.from(data, 'base64'));
  }
}
