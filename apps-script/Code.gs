/**
 * QA Database — Google Apps Script backend
 * =========================================
 * Paste this into the Apps Script editor of a Google Sheet
 * (Extensions ▸ Apps Script), then deploy as a Web App.
 * See SETUP-HOSTING.md for the full walkthrough.
 *
 * Endpoints:
 *   GET  ?action=categories   -> { ok:true, tree:[...] }
 *   GET  ?action=ping         -> { ok:true, ts:"..." }
 *   POST { action:"save", serviceTag, editorEmail, editTime, selections:[[...],...], token }
 *   POST { action:"setCategories", tree:[...], adminKey }
 *
 * Optional Script Properties (Project Settings ▸ Script Properties):
 *   SUBMIT_TOKEN  - if set, save requests must include a matching "token"
 *   ADMIN_KEY     - if set, setCategories requests must include a matching "adminKey"
 */

var RECORDS_SHEET = 'Records';
var FIXED_HEADERS = ['Timestamp', 'Service Tag', 'Editor Email', 'Edit Time (min)'];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action || '').toLowerCase();
  if (action === 'categories') return json({ ok: true, tree: getCategories() });
  if (action === 'ping') return json({ ok: true, ts: new Date().toISOString() });
  return json({ ok: true, app: 'QA Database', usage: ['?action=categories', '?action=ping'] });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'Server busy, please retry.' });
  }
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'save': return saveRecords(body);
      case 'setCategories': return setCategories(body);
      default: return json({ ok: false, error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Categories (shared tree, stored in Script Properties) ---------- */

function getCategories() {
  var raw = PropertiesService.getScriptProperties().getProperty('CATEGORIES');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function setCategories(body) {
  var props = PropertiesService.getScriptProperties();
  var adminKey = props.getProperty('ADMIN_KEY');
  if (adminKey && body.adminKey !== adminKey) {
    return json({ ok: false, needAdmin: true, error: 'Admin key required to edit categories.' });
  }
  var tree = body.tree || [];
  var serialized = JSON.stringify(tree);
  // Script Properties cap each value at 9 KB. Warn rather than silently truncate.
  if (serialized.length > 9000) {
    return json({ ok: false, error: 'Category tree too large for Script Properties (>9KB). Trim it or switch storage.' });
  }
  props.setProperty('CATEGORIES', serialized);
  return json({ ok: true });
}

/* ---------- Records (append to the sheet, one row per selection) ---------- */

function saveRecords(body) {
  var token = PropertiesService.getScriptProperties().getProperty('SUBMIT_TOKEN');
  if (token && body.token !== token) return json({ ok: false, error: 'Invalid submit token.' });

  var selections = body.selections || [];
  if (!selections.length) return json({ ok: false, error: 'No selections provided.' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RECORDS_SHEET) || ss.insertSheet(RECORDS_SHEET);

  var maxLevels = 0;
  selections.forEach(function (s) { if (s.length > maxLevels) maxLevels = s.length; });

  var headerLen = ensureHeader(sheet, maxLevels);
  var ts = new Date();
  var editTime = (body.editTime === '' || body.editTime == null) ? '' : Number(body.editTime);

  var rows = selections.map(function (levels) {
    var row = [ts, body.serviceTag || '', body.editorEmail || '', editTime];
    for (var i = 0; i < headerLen - FIXED_HEADERS.length; i++) row.push(levels[i] || '');
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headerLen).setValues(rows);
  return json({ ok: true, saved: rows.length });
}

/**
 * Make sure row 1 has Timestamp, Service Tag, Editor Email, Edit Time (min),
 * then Level 1..N where N grows to fit the deepest selection ever seen.
 * Returns the total header length.
 */
function ensureHeader(sheet, neededLevels) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol >= 1 && sheet.getLastRow() >= 1
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];
  var existingLevels = existing.filter(function (h) { return /^Level \d+$/.test(h); }).length;
  var totalLevels = Math.max(existingLevels, neededLevels);

  var header = FIXED_HEADERS.slice();
  for (var i = 1; i <= totalLevels; i++) header.push('Level ' + i);

  if (existing.slice(0, header.length).join('') !== header.join('')) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return header.length;
}

/* ---------- helper ---------- */

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
