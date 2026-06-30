/* QA Database — configuration
 * ---------------------------------------------------------------------------
 * Leave `endpoint` empty ("") to run in LOCAL-FILE mode (saves to your own
 * .xlsx via the browser, exactly like the offline app).
 *
 * To use the SHARED database, deploy the Apps Script web app (see
 * SETUP-HOSTING.md) and paste its URL (ends with /exec) into `endpoint`.
 * --------------------------------------------------------------------------- */
window.QA_CONFIG = {
  // Apps Script Web App URL, e.g. "https://script.google.com/macros/s/AKfy.../exec"
  endpoint: "",

  // Optional: link to your Google Sheet, shown as "Open / export" for admins.
  sheetUrl: "",

  // Optional: must match SUBMIT_TOKEN in the script (if you set one).
  submitToken: ""
};
