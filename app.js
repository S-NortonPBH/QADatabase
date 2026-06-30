/* QA Database — Miller columns + staged selections + Excel append
   (SheetJS + File System Access API) */
(function () {
  "use strict";

  // ----- Excel schema -----
  // Fixed leading columns; level columns (Level 1, Level 2, ...) are added
  // dynamically based on how deep the selections go.
  const FIXED_COLUMNS = ["Timestamp", "Service Tag", "Editor Email", "Edit Time (min)"];
  const SHEET_NAME = "QA";

  // ----- Persistence keys -----
  const LS_TREE = "qa_tree_v1";
  const LS_ADMIN = "qa_admin_key";
  const IDB_NAME = "qa-database";

  // ----- Cloud config (from config.js) -----
  // When an endpoint is set we run in SHARED mode: categories come from the
  // server and saves POST records to it. Otherwise we run in LOCAL-FILE mode.
  const cfg = window.QA_CONFIG || {};
  const CLOUD = !!(cfg.endpoint && String(cfg.endpoint).trim());

  // ----- State -----
  let tree = loadTree();          // { id, name:'root', children:[] }
  let path = [];                  // currently-built selection (array of node objects)
  let staged = [];                // [{ names:[...] }] selections waiting to be saved
  let fileHandle = null;          // FileSystemFileHandle

  const supportsFS = typeof window.showSaveFilePicker === "function";

  // ----- DOM -----
  const $ = (id) => document.getElementById(id);
  const els = {
    serviceTag: $("serviceTag"),
    editorEmail: $("editorEmail"),
    editTime: $("editTime"),
    columns: $("columns"),
    pathDisplay: $("pathDisplay"),
    addSelectionBtn: $("addSelectionBtn"),
    stagedList: $("stagedList"),
    stagedCount: $("stagedCount"),
    clearStagedBtn: $("clearStagedBtn"),
    chooseFileBtn: $("chooseFileBtn"),
    dbStatus: $("dbStatus"),
    saveBtn: $("saveBtn"),
    toast: $("toast"),
  };

  // ===================================================================
  //  Tree model
  // ===================================================================
  function newNode(name) {
    return { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), name, children: [] };
  }
  function loadTree() {
    try {
      const raw = localStorage.getItem(LS_TREE);
      if (raw) {
        const t = JSON.parse(raw);
        if (t && Array.isArray(t.children)) return t;
      }
    } catch (e) { /* ignore */ }
    return { id: "root", name: "root", children: [] };
  }
  function saveTree() {
    try { localStorage.setItem(LS_TREE, JSON.stringify(tree)); } catch (e) { /* ignore */ }
    if (CLOUD) pushCategories();
  }

  // ===================================================================
  //  Cloud API (Apps Script web app)
  // ===================================================================
  async function apiGet(action) {
    const url = cfg.endpoint + (cfg.endpoint.indexOf("?") >= 0 ? "&" : "?") + "action=" + encodeURIComponent(action);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  async function apiPost(payload) {
    // text/plain keeps this a CORS "simple request" (no preflight), which is
    // what Apps Script web apps accept cross-origin.
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // Push the shared category tree to the server (debounced). If the server has
  // an ADMIN_KEY set, prompt for it once and remember it locally.
  let catSyncTimer = null;
  function pushCategories() {
    clearTimeout(catSyncTimer);
    catSyncTimer = setTimeout(async () => {
      try {
        const r = await apiPost({ action: "setCategories", tree: tree.children, adminKey: localStorage.getItem(LS_ADMIN) || "" });
        if (!r.ok) {
          if (r.needAdmin) {
            const key = window.prompt("Enter the admin key to edit shared categories:");
            if (key) { localStorage.setItem(LS_ADMIN, key); pushCategories(); }
            else toast("Category change not saved (admin key required).", "bad");
          } else {
            toast("Couldn't save categories: " + (r.error || "error"), "bad");
          }
        }
      } catch (e) {
        toast("Couldn't reach the server to save categories.", "bad");
      }
    }, 700);
  }

  // ===================================================================
  //  Render Miller columns
  // ===================================================================
  function render() {
    els.columns.innerHTML = "";
    for (let c = 0; c <= path.length; c++) {
      const parent = c === 0 ? tree : path[c - 1];
      const selectedChild = path[c];
      els.columns.appendChild(buildColumn(parent, c, selectedChild));
    }
    els.columns.scrollLeft = els.columns.scrollWidth;
    renderPath();
  }

  function buildColumn(parent, colIndex, selectedChild) {
    const col = document.createElement("div");
    col.className = "column";

    const title = document.createElement("div");
    title.className = "col-title";
    title.textContent = colIndex === 0 ? "Top level" : parent.name;
    col.appendChild(title);

    const body = document.createElement("div");
    body.className = "col-body";
    if (parent.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "col-empty";
      empty.textContent = "No items yet — add one below.";
      body.appendChild(empty);
    } else {
      parent.children.forEach((node) => {
        body.appendChild(buildItem(node, parent, colIndex, selectedChild));
      });
    }
    col.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "col-foot";
    const addRow = document.createElement("div");
    addRow.className = "add-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add item…";
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.title = "Add item to this column";
    const doAdd = () => {
      const name = input.value.trim();
      if (!name) return;
      parent.children.push(newNode(name));
      saveTree();
      input.value = "";
      render();
    };
    addBtn.addEventListener("click", doAdd);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    foot.appendChild(addRow);
    col.appendChild(foot);

    return col;
  }

  function buildItem(node, parent, colIndex, selectedChild) {
    const row = document.createElement("div");
    row.className = "item" + (selectedChild && selectedChild.id === node.id ? " selected" : "");

    const label = document.createElement("span");
    label.className = "item-label";
    label.textContent = node.name;
    row.appendChild(label);

    if (node.children.length > 0) {
      const chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "›";
      row.appendChild(chev);
    }

    const actions = document.createElement("span");
    actions.className = "item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.innerHTML = "&#9998;";
    renameBtn.title = "Rename";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = window.prompt("Rename item:", node.name);
      if (name && name.trim()) { node.name = name.trim(); saveTree(); render(); }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn del";
    delBtn.innerHTML = "&times;";
    delBtn.title = "Delete";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const kids = node.children.length;
      const msg = kids > 0
        ? `Delete "${node.name}" and its ${kids} sub-item(s)?`
        : `Delete "${node.name}"?`;
      if (!window.confirm(msg)) return;
      const idx = parent.children.findIndex((n) => n.id === node.id);
      if (idx >= 0) parent.children.splice(idx, 1);
      if (path[colIndex] && path[colIndex].id === node.id) path = path.slice(0, colIndex);
      saveTree();
      render();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);

    label.addEventListener("click", () => selectNode(node, colIndex));
    row.addEventListener("click", (e) => {
      if (e.target === row || e.target === label || e.target.classList.contains("chev")) {
        selectNode(node, colIndex);
      }
    });

    return row;
  }

  function selectNode(node, colIndex) {
    path = path.slice(0, colIndex);
    path.push(node);
    render();
  }

  function renderPath() {
    if (path.length === 0) {
      els.pathDisplay.textContent = "No selection yet";
      return;
    }
    els.pathDisplay.innerHTML = path.map((n) => `<b>${escapeHtml(n.name)}</b>`).join(" › ");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ===================================================================
  //  Staged selections
  // ===================================================================
  function addSelection() {
    if (path.length === 0) { toast("Build a selection in the columns first.", "bad"); return; }
    staged.push({ names: path.map((n) => n.name) });
    path = [];
    render();
    renderStaged();
    toast(`Selection added (${staged.length} staged).`, "good");
  }

  function renderStaged() {
    els.stagedCount.textContent = `(${staged.length})`;
    els.clearStagedBtn.disabled = staged.length === 0;
    els.stagedList.innerHTML = "";
    if (staged.length === 0) {
      const li = document.createElement("li");
      li.className = "staged-empty";
      li.innerHTML = "No selections staged yet. Build a path above and click <b>+ Add selection</b>.";
      els.stagedList.appendChild(li);
      return;
    }
    staged.forEach((sel, i) => {
      const li = document.createElement("li");
      li.className = "staged-item";

      const num = document.createElement("span");
      num.className = "staged-num";
      num.textContent = i + 1;

      const txt = document.createElement("span");
      txt.className = "staged-path";
      txt.innerHTML = sel.names.map((n) => escapeHtml(n)).join(' <span class="sep">›</span> ');

      const del = document.createElement("button");
      del.className = "icon-btn del";
      del.innerHTML = "&times;";
      del.title = "Remove this selection";
      del.addEventListener("click", () => {
        staged.splice(i, 1);
        renderStaged();
      });

      li.appendChild(num);
      li.appendChild(txt);
      li.appendChild(del);
      els.stagedList.appendChild(li);
    });
  }

  // ===================================================================
  //  IndexedDB — remember the chosen file handle between sessions
  // ===================================================================
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(IDB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("kv", mode);
        const store = tx.objectStore("kv");
        const req = fn(store);
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const idbGet = (key) => idb("readonly", (s) => s.get(key));
  const idbSet = (key, val) => idb("readwrite", (s) => s.put(val, key));

  async function verifyPermission(handle) {
    const opts = { mode: "readwrite" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  function setDbStatus() {
    if (CLOUD) {
      els.chooseFileBtn.style.display = "none";
      let html = "Connected to <b>shared database</b>.";
      if (cfg.sheetUrl) {
        html += ` <a href="${escapeHtml(cfg.sheetUrl)}" target="_blank" rel="noopener">Open / export ↗</a>`;
      }
      els.dbStatus.innerHTML = html;
      return;
    }
    if (fileHandle) {
      els.dbStatus.innerHTML = `Database: <b>${escapeHtml(fileHandle.name)}</b>`;
    } else {
      els.dbStatus.textContent = supportsFS
        ? "No database file connected."
        : "This browser can't append to files — saves will download instead. Use Edge or Chrome to append.";
    }
  }

  // ===================================================================
  //  Choose / connect database file
  // ===================================================================
  async function chooseFile() {
    if (!supportsFS) {
      toast("Your browser doesn't support saving to a file directly. Open this in Edge or Chrome.", "bad");
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "qa-database.xlsx",
        types: [{ description: "Excel Workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
      });
      fileHandle = handle;
      // Remember the handle for next session, but never let IndexedDB block the
      // connect/save flow — persisting it is best-effort only.
      idbSet("fileHandle", handle).catch(() => {});
      setDbStatus();
      toast("Database file connected.", "good");
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.error(e);
      toast("Couldn't connect file: " + (e.message || e), "bad");
    }
  }

  // ===================================================================
  //  Save — one row per staged selection, each level in its own column
  // ===================================================================
  function computeHeader(rows) {
    const levelSet = new Set();
    const others = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => {
      if (FIXED_COLUMNS.includes(k)) return;
      if (/^Level \d+$/.test(k)) levelSet.add(k);
      else others.add(k);
    }));
    const levels = [...levelSet].sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10));
    return [...FIXED_COLUMNS, ...levels, ...others];
  }

  async function save() {
    const serviceTag = els.serviceTag.value.trim();
    const editorEmail = els.editorEmail.value.trim();
    const editTimeRaw = els.editTime.value.trim();

    let firstBad = null;
    const flag = (el, bad) => { el.classList.toggle("invalid", bad); if (bad && !firstBad) firstBad = el; };

    flag(els.serviceTag, serviceTag === "");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editorEmail);
    flag(els.editorEmail, !emailOk);
    const editTime = Number(editTimeRaw);
    const timeOk = editTimeRaw !== "" && Number.isFinite(editTime) && editTime >= 0;
    flag(els.editTime, !timeOk);

    if (firstBad) { firstBad.focus(); toast("Please fix the highlighted field(s).", "bad"); return; }

    // If nothing is staged but a selection is built, stage it automatically.
    if (staged.length === 0 && path.length > 0) {
      staged.push({ names: path.map((n) => n.name) });
      path = [];
      render();
      renderStaged();
    }
    if (staged.length === 0) { toast("Add at least one selection before saving.", "bad"); return; }

    const selections = staged.map((sel) => sel.names.slice());

    els.saveBtn.disabled = true;
    try {
      if (CLOUD) {
        await saveToCloud(serviceTag, editorEmail, editTime, selections);
      } else {
        const timestamp = new Date().toLocaleString();
        const newRows = selections.map((names) => {
          const row = {
            "Timestamp": timestamp,
            "Service Tag": serviceTag,
            "Editor Email": editorEmail,
            "Edit Time (min)": editTime,
          };
          names.forEach((name, i) => { row["Level " + (i + 1)] = name; });
          return row;
        });
        if (supportsFS) await saveToHandle(newRows);
        else downloadRows(newRows);
      }
      const n = selections.length;
      toast(`Saved ✓  ${n} selection${n === 1 ? "" : "s"} written.`, "good");
      // clear EVERYTHING editable for the next batch (tree is kept)
      staged = [];
      path = [];
      els.serviceTag.value = "";
      els.editorEmail.value = "";
      els.editTime.value = "";
      render();
      renderStaged();
    } catch (e) {
      console.error(e);
      toast("Save failed: " + (e.message || e), "bad");
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  async function saveToHandle(newRows) {
    if (!fileHandle) {
      await chooseFile();
      if (!fileHandle) throw new Error("No database file selected.");
    }
    if (!(await verifyPermission(fileHandle))) {
      throw new Error("Permission to write the file was denied.");
    }

    let wb, rows = [];
    const file = await fileHandle.getFile();
    if (file.size > 0) {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (ws) rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    } else {
      wb = XLSX.utils.book_new();
    }

    rows = rows.concat(newRows);
    const header = computeHeader(rows);
    const ws = XLSX.utils.json_to_sheet(rows, { header: header });
    ws["!cols"] = header.map((h) => ({ wch: h === "Editor Email" ? 26 : (h === "Timestamp" ? 20 : 16) }));

    if (wb.SheetNames.length) {
      wb.Sheets[wb.SheetNames[0]] = ws;
    } else {
      XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    }

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const writable = await fileHandle.createWritable();
    await writable.write(out);
    await writable.close();
  }

  function downloadRows(newRows) {
    const header = computeHeader(newRows);
    const ws = XLSX.utils.json_to_sheet(newRows, { header: header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    XLSX.writeFile(wb, "qa-database-" + Date.now() + ".xlsx");
  }

  async function saveToCloud(serviceTag, editorEmail, editTime, selections) {
    const r = await apiPost({
      action: "save",
      serviceTag: serviceTag,
      editorEmail: editorEmail,
      editTime: editTime,
      selections: selections,
      token: cfg.submitToken || "",
    });
    if (!r.ok) throw new Error(r.error || "the server rejected the save");
  }

  // ===================================================================
  //  Toast
  // ===================================================================
  let toastTimer = null;
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.className = "toast"; }, 3200);
  }

  // ===================================================================
  //  Init
  // ===================================================================
  async function init() {
    [els.serviceTag, els.editorEmail, els.editTime].forEach((el) =>
      el.addEventListener("input", () => el.classList.remove("invalid")));

    els.addSelectionBtn.addEventListener("click", addSelection);
    els.clearStagedBtn.addEventListener("click", () => { staged = []; renderStaged(); });
    els.chooseFileBtn.addEventListener("click", chooseFile);
    els.saveBtn.addEventListener("click", save);

    if (CLOUD) {
      els.chooseFileBtn.style.display = "none";
      setDbStatus();
      render();          // show cached tree immediately
      renderStaged();
      try {
        const r = await apiGet("categories");
        if (r && r.ok && Array.isArray(r.tree)) {
          tree = { id: "root", name: "root", children: r.tree };
          try { localStorage.setItem(LS_TREE, JSON.stringify(tree)); } catch (e) { /* ignore */ }
          render();      // re-render with the shared tree
        }
      } catch (e) {
        toast("Couldn't load shared categories (offline?). Showing last cached copy.", "bad");
      }
      return;
    }

    if (supportsFS) {
      try {
        const handle = await idbGet("fileHandle");
        if (handle) fileHandle = handle; // permission re-verified on first save
      } catch (e) { /* ignore */ }
    }

    setDbStatus();
    render();
    renderStaged();
  }

  init();
})();
