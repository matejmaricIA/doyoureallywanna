// Record the demo GIF (and an MP4 of it) from the real pause page, for the
// README and launch posts (D-038). Usage: npm run demo
//
// Someone is writing, opens a new tab, types youtube.com, gets the pause page
// ("That's the 6th time today."), clicks "No, not now", sees the countdown,
// and is back on their work. The pause page and the countdown are the real
// extension pages; the window around them is a plain mock browser with no
// Edge or Chrome branding. Frames are taken one by one at 2× and given their
// own durations, so the result is the same every run, then ffmpeg encodes them.
//
// Needs ffmpeg: on the PATH, or set FFMPEG=/path/to/ffmpeg.
//
// store/gifs/do-you-really-wanna-demo.gif  960 px wide, for the README and Reddit
// store/gifs/do-you-really-wanna-demo.mp4  1560 px wide, sharper, where video works

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, waitUntil } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'store', 'gifs');
const NAME = 'do-you-really-wanna-demo';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).error) {
  console.error('ffmpeg not found. Install it (e.g. `winget install Gyan.FFmpeg`) or set FFMPEG=/path/to/ffmpeg.');
  process.exit(1);
}

const SITES = ['youtube.com', 'reddit.com', 'instagram.com'];
const WIDTH = 1040;
const HEIGHT = 660;

// A copy of the extension with access to the demo sites already granted, and
// the mock browser window as one of its pages, so the pause page can sit in
// it as a same-origin iframe. No site is ever visited.
const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-demo-'));
const framesDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-demo-frames-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = SITES.map((site) => `*://*.${site}/*`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

writeFileSync(path.join(extDir, 'demo.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body { margin: 0; height: 100%; overflow: hidden; background: #dfe1e6; font-family: system-ui, "Segoe UI", sans-serif; }
      .win { position: absolute; inset: 0; display: flex; flex-direction: column; }
      .tabs { height: 40px; display: flex; align-items: flex-end; gap: 2px; padding: 0 10px; }
      .tab { width: 220px; height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
             border-radius: 9px 9px 0 0; font-size: 12.5px; color: #3c3e46; white-space: nowrap; overflow: hidden; }
      .tab.active { background: #f7f8fa; color: #1f2027; }
      .ico { width: 14px; height: 14px; border-radius: 3px; flex: none; }
      .x { margin-left: auto; color: #8a8c95; font-size: 13px; }
      .bar { height: 44px; display: flex; align-items: center; gap: 14px; padding: 0 14px;
             background: #f7f8fa; border-bottom: 1px solid #e1e2e6; }
      .nav { color: #8a8c95; font-size: 16px; letter-spacing: 10px; }
      .addr { flex: 1; height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
              border-radius: 15px; background: #eceef1; font-size: 13.5px; color: #1f2027; }
      .addr.focus { background: #fff; box-shadow: 0 0 0 2px #8f91c4; }
      .caret { display: inline-block; width: 1px; height: 16px; margin-left: 1px; background: #1f2027; }
      .chip { padding-right: 8px; border-right: 1px solid #cfd1d6; font-size: 12.5px; }
      .dim { color: #8a8c95; }
      .content { flex: 1; position: relative; background: #fff; }
      .content > * { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      .doc { padding: 54px 120px; color: #1f2027; }
      .doc h1 { margin: 0 0 22px; font: 600 26px Georgia, serif; }
      .doc p { max-width: 640px; margin: 0 0 14px; font: 16px/1.7 Georgia, serif; color: #3c3e46; }
      .blank { background: #fbfbfc; }
      .cursor { position: absolute; z-index: 9; width: 22px; height: 22px; pointer-events: none; }
    </style>
  </head>
  <body>
    <div class="win">
      <div class="tabs">
        <div class="tab active" id="tab-work"><span class="ico" style="background: #7d8bb5"></span>Chapter 3 – draft<span class="x">×</span></div>
        <div class="tab" id="tab-new" hidden><span class="ico" id="new-ico" style="background: #c9cbd2"></span><span id="new-title">New tab</span><span class="x">×</span></div>
      </div>
      <div class="bar"><span class="nav">‹ › ↻</span><div class="addr" id="addr"></div></div>
      <div class="content">
        <div class="doc" id="doc">
          <h1>Chapter 3 – Methods</h1>
          <p>The interviews were held over six weeks, each one recorded and transcribed the same day. Before coding them, I read every transcript once without taking notes, to get a feel for what people kept coming back to.</p>
          <p>Two themes came up again and again: how often people reached for their phone without deciding to, and how hard it was to say afterwards what they had actually looked at.</p>
          <p>The rest of this chapter describes how</p>
        </div>
        <div class="blank" id="blank" hidden></div>
        <iframe id="frame" hidden></iframe>
      </div>
    </div>
    <svg class="cursor" id="cursor" viewBox="0 0 24 24" hidden>
      <path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.3 L11.3 13.6 L17.5 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" />
    </svg>
  </body>
</html>`);

/** Today as the extension writes it in its stats. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** @type {{ file: string, ms: number }[]} */
const timeline = [];
const browser = await launch({ name: 'demo' });
try {
  const id = await browser.loadExtension(extDir);
  const base = `chrome-extension://${id}`;
  const optionsTarget = await waitUntil(
    async () => (await browser.targets()).find((t) => t.url === `${base}/options/options.html`),
    { what: 'options page', timeout: 30_000 },
  );
  const options = await browser.attach(optionsTarget.targetId);
  await options.settle();
  // Five times today already, so the pause page says "the 6th time today".
  await options.evaluate(`chrome.storage.local.set(${JSON.stringify({
    schema: 3,
    sites: Object.fromEntries(SITES.map((site, i) => [site, { added: Date.now() - 10 * 86_400_000 + i }])),
    settings: { graceMinutes: 5, countdownSeconds: 4, suggestions: false },
    stats: { [today()]: { 'youtube.com': [5, 1], 'reddit.com': [2, 1] } },
  })})`);

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, scale: 2 });
  await page.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  // In every frame, the iframe too: the same question and message each run,
  // and "No" must not close the real tab this is recorded in. The mock
  // window "closes" the tab itself, below.
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const v = [0, 0.2]; let i = 0; Math.random = () => v[Math.min(i++, v.length - 1)];
      if (window !== top && globalThis.chrome?.tabs) Object.defineProperty(chrome.tabs, 'getCurrent', { value: async () => undefined });
    })();`,
  });
  await page.navigate(`${base}/demo.html`);
  await page.settle();

  /** Run code in the mock window. @param {string} code */
  const run = (code) => page.evaluate(`(async () => { ${code} })()`);
  /** @param {string} id */
  const el = (id) => `document.getElementById(${JSON.stringify(id)})`;
  const pauseDoc = `${el('frame')}.contentDocument`;
  /** @param {string} html @param {boolean} focus */
  const address = (html, focus) =>
    run(`${el('addr')}.innerHTML = ${JSON.stringify(html)}; ${el('addr')}.classList.toggle('focus', ${focus});`);
  /** Take a frame and show it for `ms`. @param {number} ms */
  const frame = async (ms) => {
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const file = `f${String(timeline.length).padStart(4, '0')}.png`;
    await page.screenshot(path.join(framesDir, file));
    timeline.push({ file, ms });
  };
  const WORK_ADDRESS = '<span class="dim">notes.example/chapter-3</span>';

  // 1. Writing.
  await address(WORK_ADDRESS, false);
  await frame(1400);

  // 2. A new tab, and the hands type it.
  await run(`${el('tab-work')}.classList.remove('active'); ${el('tab-new')}.hidden = false; ${el('tab-new')}.classList.add('active');
    ${el('doc')}.hidden = true; ${el('blank')}.hidden = false;`);
  await address('<span class="caret"></span>', true);
  await frame(450);
  const typed = 'youtube.com';
  for (let i = 1; i <= typed.length; i++) {
    await address(`${typed.slice(0, i)}<span class="caret"></span>`, true);
    await frame(i === typed.length ? 500 : 85);
  }

  // 3. Enter: the pause page, and YouTube never loads.
  await run(`const f = ${el('frame')};
    f.src = '${base}/pause/pause.html#https://www.youtube.com/';
    await new Promise((r) => f.addEventListener('load', r, { once: true }));
    f.hidden = false; ${el('blank')}.hidden = true;
    ${el('new-title')}.textContent = 'Do you really wanna?';
    ${el('new-ico')}.outerHTML = '<img class="ico" src="icons/icon-32.png" alt="" />';`);
  await waitUntil(() => run(`return !!${pauseDoc}.getElementById('count')?.textContent`), { what: 'pause page' });
  await sleep(200);
  await address('<span class="chip">Do You Really Wanna?</span><span class="dim">extension://…/pause.html</span>', false);
  await frame(2600);

  // 4. The cursor goes to "No, not now".
  const target = await run(`const r = ${el('frame')}.getBoundingClientRect();
    const b = ${pauseDoc}.getElementById('no').getBoundingClientRect();
    return { x: r.left + b.left + b.width * 0.55, y: r.top + b.top + b.height * 0.6 };`);
  const start = { x: target.x + 260, y: target.y + 150 };
  await run(`${el('cursor')}.hidden = false;`);
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const ease = 1 - (1 - i / steps) ** 3;
    const x = start.x + (target.x - start.x) * ease;
    const y = start.y + (target.y - start.y) * ease;
    await run(`${el('cursor')}.style.left = '${x - 4}px'; ${el('cursor')}.style.top = '${y - 2}px';`);
    await frame(i === steps ? 350 : 35);
  }

  // 5. "No": something kind, and the countdown.
  await run(`${pauseDoc}.getElementById('no').click(); ${el('cursor')}.hidden = true;`);
  for (const left of [4, 3, 2, 1]) {
    await waitUntil(() => run(`return ${pauseDoc}.getElementById('countdown').textContent.includes('${left}')`), {
      what: `countdown at ${left}`,
    });
    await frame(left === 4 ? 1600 : 1000);
  }

  // 6. The tab closes: back to work. Same as the first frame, so it loops.
  await run(`${el('tab-new')}.hidden = true; ${el('frame')}.hidden = true; ${el('doc')}.hidden = false;
    ${el('tab-work')}.classList.add('active');`);
  await address(WORK_ADDRESS, false);
  await frame(1800);
} finally {
  await browser.close();
  rmSync(extDir, { recursive: true, force: true });
}

try {
  // The concat demuxer wants the last file listed once more, after its duration.
  const list = timeline.flatMap((f) => [`file '${f.file}'`, `duration ${(f.ms / 1000).toFixed(3)}`]);
  list.push(`file '${timeline.at(-1)?.file}'`);
  writeFileSync(path.join(framesDir, 'list.txt'), `${list.join('\n')}\n`);
  mkdirSync(out, { recursive: true });

  /** @param {string[]} args */
  const encode = (args) => {
    const result = spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', ...args], {
      cwd: framesDir,
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error(`ffmpeg failed (exit ${result.status})`);
  };
  encode([
    '-filter_complex',
    'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none',
    '-fps_mode', 'vfr', '-loop', '0',
    path.join(out, `${NAME}.gif`),
  ]);
  encode([
    '-vf', 'fps=30,scale=1560:-2:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
    path.join(out, `${NAME}.mp4`),
  ]);
  const seconds = (timeline.reduce((sum, f) => sum + f.ms, 0) / 1000).toFixed(1);
  console.log(`wrote store/gifs/${NAME}.gif and .mp4 (${timeline.length} frames, ${seconds} s)`);
} finally {
  rmSync(framesDir, { recursive: true, force: true });
}
