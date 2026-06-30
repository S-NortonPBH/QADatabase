# Hosting QA Database online (shared database)

This turns the app into a team tool: everyone shares one category list, and all
records collect in **one Google Sheet** you own. Two pieces:

1. **Backend** — a Google Apps Script web app bound to a Google Sheet (free).
2. **Front-end** — the static files in this folder, hosted anywhere with HTTPS.

You can try the whole thing **locally first** (see "Try it locally" at the end)
before touching Google.

---

## Part 1 — Create the backend (Google Sheet + Apps Script)

1. Go to <https://sheets.new> to create a new Google Sheet. Name it e.g.
   *QA Database*.
2. In the menu: **Extensions ▸ Apps Script**. A code editor opens.
3. Delete the placeholder `function myFunction(){}` and **paste the entire
   contents of [`apps-script/Code.gs`](apps-script/Code.gs)**. Click 💾 Save.
4. Deploy it as a web app:
   - **Deploy ▸ New deployment**.
   - Click the gear ⚙ next to "Select type" → **Web app**.
   - **Execute as:** *Me*.
   - **Who has access:** *Anyone* (this means anyone with the URL can call it;
     it does **not** expose your Sheet — only the actions in the script).
   - Click **Deploy**, then **Authorize access** and approve the permissions
     (you'll see a "Google hasn't verified this app" screen — click *Advanced ▸
     Go to … (unsafe)*; it's your own script).
   - Copy the **Web app URL** — it ends in `/exec`.

That URL is your backend. Records will append to a tab called **Records**
(created automatically on first save); shared categories are stored in the
script's properties.

### Optional security (recommended for real teams)

In Apps Script: **Project Settings ⚙ ▸ Script Properties ▸ Add script property**:

| Property | Effect |
|----------|--------|
| `SUBMIT_TOKEN` | If set, only requests sending the same token can save records. Put the same value in `config.js` → `submitToken`. |
| `ADMIN_KEY` | If set, editing the shared category list requires this key (the app asks once and remembers it per browser). |

Leave both unset to keep submissions and category editing open.

> **Re-deploying after editing the script:** use **Deploy ▸ Manage deployments ▸
> ✏ Edit ▸ Version: New version ▸ Deploy**. The `/exec` URL stays the same.

---

## Part 2 — Point the app at your backend

Open [`config.js`](config.js) and fill in:

```js
window.QA_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfy..../exec",  // your /exec URL
  sheetUrl: "https://docs.google.com/spreadsheets/d/..../edit",  // optional, for the Open/export link
  submitToken: ""                                                // only if you set SUBMIT_TOKEN
};
```

With `endpoint` set, the app switches to **shared mode** automatically: it loads
categories from the server, hides the local-file button, and every Save posts to
your Sheet.

---

## Part 3 — Host the front-end (pick one)

You only need these files online: `index.html`, `styles.css`, `app.js`,
`config.js`, and `vendor/`. (The `.ps1`, `.cmd`, and `apps-script/` files are
local helpers — they don't need to be uploaded.)

**Netlify Drop (easiest, ~2 min):**
1. Go to <https://app.netlify.com/drop>.
2. Drag the `qa-database` folder onto the page.
3. You get a `https://….netlify.app` URL. Share it. Done.

**Cloudflare Pages / Vercel:** same idea — "deploy a folder / static site".

**GitHub Pages:** push this folder to a repo, then **Settings ▸ Pages ▸ Deploy
from a branch ▸ /(root)**. Your site appears at `https://<user>.github.io/<repo>/`.

Any of these serves over **HTTPS**, which is all the app needs. Because data now
goes through the backend, it works in **every browser** (Chrome, Edge, Firefox,
Safari, mobile) — the old Edge/Chrome-only limit is gone.

---

## Getting your data out

Your records live in the **Records** tab of the Google Sheet. To get an Excel
file: **File ▸ Download ▸ Microsoft Excel (.xlsx)**. Columns are
`Timestamp, Service Tag, Editor Email, Edit Time (min), Level 1, Level 2, …`
(the Level columns grow automatically to fit the deepest selection).

---

## Try it locally first (optional)

You can exercise shared mode on your own machine before deploying:

1. In `config.js`, temporarily set `endpoint: "http://localhost:8799/exec"`.
2. Run **`dev-mock-server.ps1`** (right-click ▸ Run with PowerShell, or
   `powershell -ExecutionPolicy Bypass -File dev-mock-server.ps1`). It serves the
   app at <http://localhost:8799/> with a fake in-memory backend.
3. Open that URL in your browser and use the app — categories and saves go to the
   mock (data resets when you stop the server).
4. When done, set `endpoint` back to your real `/exec` URL (or `""`).

---

## Notes & limits

- **Shared categories use last-write-wins.** If two people edit the category tree
  at the same moment, the later save wins. Fine for a small team; tell me if you
  need locking or per-user trees.
- **Category tree size:** stored in Script Properties (9 KB cap). That's plenty
  for a normal taxonomy; the script returns a clear error if you exceed it.
- **Edit Time** is one value per save, written to every row in that batch (same
  as the offline app).
