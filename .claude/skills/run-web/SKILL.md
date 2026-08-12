---
name: run-web
description: Build, run, and drive the open-daams Next.js web app in a headless browser. Use when asked to start the app, screenshot a page, or verify a UI change/interactive flow actually works.
---

open-daams is a plain server-rendered Next.js app (no Electron, no desktop window) — driving it
is just headless Chromium navigating a URL. For agent/automated use, drive it via the Playwright
REPL at `.claude/skills/run-web/driver.mjs`. No `xvfb` needed; headless Chromium doesn't require a
display.

All paths are relative to the repo root.

## Prerequisites

One-time browser download (already done if `~/Library/Caches/ms-playwright/chromium-*` or the
Linux equivalent exists):

```bash
npx playwright install chromium
```

## Run

Start the dev server first, and wait for it to actually serve before driving it:

```bash
npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done
```

**No `tmux` on this machine** — drive it by piping a full command sequence via heredoc instead
(the driver queues piped lines and runs them strictly in order, one at a time):

```bash
node .claude/skills/run-web/driver.mjs <<'EOF'
launch
nav /en/applications
ss applications
console --errors
quit
EOF
```

Where `tmux` **is** available (e.g. Linux CI), wrap it for interactive, multi-step use instead —
useful for iterating on a selector without relaunching the browser each time:

```bash
tmux new-session -d -s daams -x 200 -y 50
tmux send-keys -t daams 'node .claude/skills/run-web/driver.mjs' Enter
until tmux capture-pane -t daams -p | grep -q 'driver>'; do sleep 0.2; done
tmux send-keys -t daams 'launch' Enter
until tmux capture-pane -t daams -p | grep -q 'launched'; do sleep 0.2; done
tmux send-keys -t daams 'nav /en/applications' Enter
tmux send-keys -t daams 'ss applications' Enter
tmux capture-pane -t daams -p
```

Screenshots land in `/tmp/shots/` (override: `SCREENSHOT_DIR`). Base URL defaults to
`http://localhost:3000` (override: `BASE_URL`).

### Commands

| command | what it does |
|---|---|
| `launch` | start headless Chromium, open a page, attach console/error capture |
| `nav <path>` | navigate — relative paths are resolved against `BASE_URL` |
| `ss [name]` | screenshot → `/tmp/shots/<name>.png` |
| `click <css-sel>` | real Playwright click (not DOM `.click()` — this is a normal page, not a BrowserView, so real click works) |
| `click-text <text>` | click the first element containing this text |
| `fill <css-sel> <value>` | set an input's value via Playwright's input pipeline |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` / `wait-text <text>` | wait up to 10s for an element / text to appear |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print innerText (whole body if no selector) |
| `console [--errors]` | dump captured browser console messages / page errors since `launch` |
| `quit` | close the browser, exit |

## Gotchas

- **Routes are locale-prefixed.** `nav /` redirects to `/nl` (the default locale). Use
  `nav /en/applications`, not `nav /applications`.
- **No real login.** Identity is simulated via a `?userId=<id>` query param (the `UserSwitcher`
  component), not a login flow. Append it directly to the path when a specific role matters, e.g.
  `nav /en/applications/<id>?userId=<a DECISION_MAKER's id>` to see decision/permit actions. Look
  up ids with `docker exec hdab-nl-daams-db-1 psql -U postgres -d hdab_daams -c 'select id, role
  from "User";'` if you don't have one handy.
- **Forms are React-controlled inputs.** Always use `fill`/`type`, never `eval` to set
  `element.value` directly — that bypasses React's `onChange` and the form won't see the input.
- **Every page is dynamically rendered** (`searchParams`/`force-dynamic` throughout
  `src/app/[locale]`) — there's no static cache to warm up or go stale.
- **Check `console --errors` before declaring a page "working."** A page can render its layout
  shell while an underlying data fetch 500s silently.

## Troubleshooting

- **`nav` hangs / times out:** dev server isn't up yet — confirm the `curl` poll in Run actually
  succeeded before launching the driver.
- **Browser download errors:** re-run `npx playwright install chromium`; check disk space
  (~250MB).
- **Selector not found:** the app uses plain Tailwind class names, not stable `data-testid`s — use
  `click-text`/`wait-text` on visible copy where possible, it's more resilient than guessing a CSS
  selector.
