# QA Database

A single-page browser app for logging QA records. Build a customizable set of
**Miller columns** (drill-down category lists, like macOS Finder's column view),
**stage one or more selections**, fill in the top fields, and **Save** to append
the rows to an Excel `.xlsx` "database" on your disk — with **each category level
in its own column**.

No install, no server runtime — it's plain HTML/CSS/JS.

## Two modes

The app runs in one of two modes depending on [`config.js`](config.js):

- **Local-file mode** (default, `endpoint: ""`) — each person saves to their own
  `.xlsx` on disk; the category tree lives in their browser. Edge/Chrome only.
- **Shared mode** (`endpoint` set to a Google Apps Script URL) — everyone shares
  one category list and all records collect in one Google Sheet. Works in every
  browser. To set this up and host it online, see
  **[SETUP-HOSTING.md](SETUP-HOSTING.md)**.

## Run it (local-file mode)

**Recommended:** double-click **`Start QA Database.cmd`**. It starts a tiny
local server (built into Windows PowerShell — no install) and opens
`http://localhost:8777/` in your browser. The first time, Windows may ask to
allow PowerShell through the firewall for local networking — that's fine.
Close the black console window to stop the server.

Why a server instead of just opening the file? The *append-to-Excel* feature
uses the browser's File System Access API, which only works in a **secure
context** (`localhost` or `https`), not a raw `file://` path. Use **Microsoft
Edge or Google Chrome**. Other browsers fall back to downloading a file per save.

## Using it

1. **Connect database file…** — pick (or create) `qa-database.xlsx`. The app
   remembers it between sessions; the first save after reopening asks once to
   confirm write permission.
2. **Build your categories** — type into the *Add item…* box at the bottom of a
   column and press Enter. Click an item to drill into the next column. Hover an
   item to **rename (✎)** or **delete (×)**.
3. **+ Add selection** — stages the path you just built and clears the columns so
   you can build the next one. Stage as many as you like; remove any with the ×
   next to it.
4. **Fill the top fields** — Service Tag, Editor Email, Total Edit Time (minutes).
5. **Save selections** — appends one row per staged selection to your Excel file,
   then **clears the top fields and the staged list** for the next batch. (Your
   category tree is kept.)

> Tip: if you forget to click *Add selection*, hitting **Save selections** with a
> path still built will stage it automatically so nothing is lost.

## What gets saved

One row per staged selection. The top fields are repeated on each row in the
batch, and **every Miller level becomes its own column**:

| Timestamp | Service Tag | Editor Email | Edit Time (min) | Level 1 | Level 2 | Level 3 | … |
|-----------|-------------|--------------|-----------------|---------|---------|---------|---|

The number of `Level N` columns grows automatically to fit the deepest
selection; shallower rows just leave the extra level cells blank.

## Where data lives

- **Excel rows** → the `.xlsx` file you connected.
- **Category tree** → this browser's local storage (persists per-browser; not in
  the Excel file).

## Files

```
qa-database/
├─ Start QA Database.cmd  # double-click to run (starts server + opens browser)
├─ serve.ps1              # tiny PowerShell static server (localhost)
├─ index.html             # markup
├─ styles.css             # styling
├─ app.js                 # all the logic (local-file + shared modes)
├─ config.js              # set the backend endpoint here for shared mode
├─ vendor/
│  └─ xlsx.full.min.js    # SheetJS (reads/writes .xlsx), bundled for offline use
├─ apps-script/
│  └─ Code.gs             # Google Apps Script backend (paste into your Sheet)
├─ dev-mock-server.ps1    # local fake backend to try shared mode before deploying
├─ SETUP-HOSTING.md       # how to host online with a shared Google Sheet database
└─ README.md
```

## Notes

- **Edit Time** is a single value for the whole batch and is written to every row
  in that save. If you'd rather capture edit time *per selection*, that's a small
  change — ask.
- Want to back up or share your category tree? An import/export-JSON button is a
  small addition.
