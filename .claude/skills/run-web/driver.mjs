// REPL driver for open-daams (plain server-rendered Next.js web app).
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
// Headless Chromium via Playwright — no xvfb/window-introspection needed,
// this is a single page, not an Electron app with BrowserViews.
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let context = null;
let page = null;
let consoleLog = [];

function attachConsoleCapture() {
  consoleLog = [];
  page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleLog.push({ type: 'pageerror', text: err.message }));
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    attachConsoleCapture();
    console.log('launched. headless Chromium ready, base url:', BASE_URL);
  },

  async nav(p) {
    if (!page) return console.log('ERROR: launch first');
    const url = p.startsWith('http') ? p : BASE_URL + (p.startsWith('/') ? p : '/' + p);
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('nav', url, '→', res ? res.status() : '(no response)');
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.click(sel, { timeout: 10_000 }); console.log('click', sel, '→ OK'); }
    catch (e) { console.log('click', sel, '→ ERROR:', e.message); }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.getByText(text, { exact: false }).first().click({ timeout: 10_000 }); console.log('click-text', JSON.stringify(text), '→ OK'); }
    catch (e) { console.log('click-text', JSON.stringify(text), '→ ERROR:', e.message); }
  },

  async fill(rest) {
    if (!page) return console.log('ERROR: launch first');
    const sp = rest.indexOf(' ');
    if (sp === -1) return console.log('usage: fill <selector> <value>');
    const sel = rest.slice(0, sp);
    const value = rest.slice(sp + 1);
    try { await page.fill(sel, value, { timeout: 10_000 }); console.log('fill', sel, '→ OK'); }
    catch (e) { console.log('fill', sel, '→ ERROR:', e.message); }
  },

  async type(text) { if (page) await page.keyboard.type(text, { delay: 20 }); },
  async press(key) { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async 'wait-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 }); console.log('found text:', JSON.stringify(text)); }
    catch { console.log('TIMEOUT waiting for text:', JSON.stringify(text)); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null,
    ));
  },

  async console(arg) {
    const onlyErrors = arg === '--errors';
    const rows = onlyErrors
      ? consoleLog.filter((m) => m.type === 'error' || m.type === 'pageerror')
      : consoleLog;
    if (rows.length === 0) { console.log(onlyErrors ? 'no console errors' : 'no console output'); return; }
    for (const m of rows) console.log(`[${m.type}] ${m.text}`);
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null; context = null; page = null;
  },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const isTTY = process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' });
function safePrompt() { if (isTTY) { try { rl.prompt(); } catch { /* ignore */ } } }

// Piped/heredoc stdin delivers every line before any async command handler
// resolves — readline's 'line' event doesn't wait for a prior async listener
// to finish. Without this queue, piped commands (the only way to drive this
// non-interactively without tmux) would run concurrently/out of order
// instead of one at a time. The whole per-line body is wrapped so nothing
// (including a prompt() call on an already-ended stdin) can reject a step
// and silently abort every command queued after it.
let queue = Promise.resolve();
let quitRequested = false;

rl.on('line', (line) => {
  queue = queue.then(async () => {
    try {
      const trimmed = line.trim();
      const sp = trimmed.indexOf(' ');
      const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
      const rest = sp === -1 ? '' : trimmed.slice(sp + 1);
      if (!cmd) return safePrompt();
      const fn = COMMANDS[cmd];
      if (!fn) { console.log('unknown:', cmd, '— try: help'); return safePrompt(); }
      try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
      if (cmd === 'quit') { quitRequested = true; return; }
      safePrompt();
    } catch (e) {
      console.log('ERROR (line handler):', e.message);
    }
  });
});
rl.on('close', async () => {
  await queue.catch((e) => console.log('ERROR (queue):', e.message));
  if (!quitRequested) await COMMANDS.quit();
  process.exit(0);
});

console.log('open-daams driver — "help" for commands, "launch" to start');
rl.prompt();
