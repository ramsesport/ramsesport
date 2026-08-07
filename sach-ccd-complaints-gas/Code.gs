/**
 * SACH Corp CCD — Patient Complaints CRM (Google Apps Script edition)
 * ---------------------------------------------------------------------
 * Entry point, sheet access helpers, and auth/role helpers shared by
 * every other .gs file. Kept deliberately small and readable — this is
 * the file to start in if something breaks.
 *
 * Data lives in the bound Google Sheet (see Setup.gs for the schema).
 * Access control has TWO layers:
 *   1. The web app deployment itself is domain-restricted (appsscript.json:
 *      webapp.access = "DOMAIN"), so only signed-in users on the corporate
 *      Workspace domain can open this at all.
 *   2. Within that, the Users sheet controls staff/admin role and
 *      active/inactive — checked by requireActiveUser()/requireAdminUser().
 *
 * IMPORTANT — Apps Script security model: every top-level `function` in
 * this project (in ANY .gs file) is directly callable from the browser
 * via google.script.run, whether or not the client-side JS ever calls
 * it. There is no "private" keyword. That means any function touching
 * sheet data MUST perform its own auth check — you cannot rely on "only
 * my trusted caller invokes this" because an attacker can call it
 * directly with different arguments. Low-level plumbing that must NOT
 * be independently reachable (raw sheet reads/writes) is namespaced
 * under the Db/Audit objects below instead of declared as top-level
 * functions — object methods are not dispatchable by google.script.run,
 * only top-level function declarations are. Every function left at the
 * top level in this project has an explicit requireActiveUser() or
 * requireAdminUser() call as its first line (except doGet/include, the
 * Setup.gs bootstrap functions, and the sendScheduledReport trigger
 * target — see the comments on those for why).
 */

// ---- Web app entry point -------------------------------------------

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('SACH Corp CCD — Patient Complaints CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Lets HTML files include other HTML files (shared CSS/JS partials). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---- Spreadsheet access (namespaced — NOT reachable via google.script.run) --

var SHEET_NAMES = {
  COMPLAINTS: 'Complaints',
  NOTES: 'Notes',
  USERS: 'Users',
  AUDIT_LOG: 'AuditLog',
  REPORT_TEMPLATES: 'ReportTemplates',
  CONFIG: 'Config',
};

var Db = {
  getSs: function () {
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  getSheet: function (name) {
    var sheet = Db.getSs().getSheetByName(name);
    if (!sheet) {
      throw new Error(
        'Sheet "' + name + '" is missing. Run Setup.gs → runInitialSetup() once from the Apps Script editor first.'
      );
    }
    return sheet;
  },

  /** Reads a sheet into an array of plain objects keyed by its header row. */
  readSheetAsObjects: function (name) {
    var sheet = Db.getSheet(name);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (row.every(function (v) { return v === '' || v === null; })) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
      obj._row = r + 1; // 1-based sheet row number, used for in-place updates
      rows.push(obj);
    }
    return rows;
  },

  appendRowFromObject: function (name, headers, obj) {
    var sheet = Db.getSheet(name);
    var row = headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
    sheet.appendRow(row);
    return sheet.getLastRow();
  },

  updateRowFromObject: function (name, headers, rowNumber, obj) {
    var sheet = Db.getSheet(name);
    var current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    var merged = headers.map(function (h, i) {
      return obj[h] !== undefined ? obj[h] : current[i];
    });
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([merged]);
  },

  // ---- Auto-increment IDs / key-value config, both stored in Config sheet --

  nextId: function (counterKey) {
    var sheet = Db.getSheet(SHEET_NAMES.CONFIG);
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === counterKey) {
        var next = Number(data[r][1]) + 1;
        sheet.getRange(r + 1, 2).setValue(next);
        return next;
      }
    }
    sheet.appendRow([counterKey, 1]); // counter didn't exist yet — start at 1
    return 1;
  },

  getConfig: function (key, fallback) {
    var sheet = Db.getSheet(SHEET_NAMES.CONFIG);
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === key) return data[r][1];
    }
    return fallback;
  },

  setConfig: function (key, value) {
    var sheet = Db.getSheet(SHEET_NAMES.CONFIG);
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === key) {
        sheet.getRange(r + 1, 2).setValue(value);
        return;
      }
    }
    sheet.appendRow([key, value]);
  },
};

function referenceNo(id) {
  return 'CCD-' + ('00000' + id).slice(-5);
}

// ---- Auth / roles -------------------------------------------------------
// These ARE meant to be reachable (getBootstrapData is the client's
// first call), so each checks exactly what it exposes: your own
// identity/role, never someone else's.

/**
 * The signed-in user's email. Reliable because the web app is deployed
 * with access restricted to the Workspace domain (see appsscript.json) —
 * there is no anonymous path into this app.
 */
function getCurrentUserEmail() {
  var email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Could not determine the signed-in user. Make sure you are signed into your @sach.org.sg Google account.');
  return email;
}

/** Returns the current user's OWN row from the Users sheet, or null if not provisioned. */
function getCurrentUser() {
  var email = getCurrentUserEmail();
  var users = Db.readSheetAsObjects(SHEET_NAMES.USERS);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email.toLowerCase()) return users[i];
  }
  return null;
}

/** Throws if the current user isn't an active, provisioned CCD staff account. */
function requireActiveUser() {
  var user = getCurrentUser();
  if (!user || !user.Active) {
    throw new Error(
      'Your account (' + getCurrentUserEmail() + ') is not set up in this system yet. Ask a CCD admin to add you under Admin → Staff accounts.'
    );
  }
  return user;
}

/** Throws unless the current user is an active admin. */
function requireAdminUser() {
  var user = requireActiveUser();
  if (user.Role !== 'admin') {
    throw new Error('This action is restricted to CCD administrators.');
  }
  return user;
}

/** Called once by the client on load to bootstrap the UI (current user + lookups). */
function getBootstrapData() {
  var user = requireActiveUser();
  return {
    email: user.Email,
    name: user.Name,
    role: user.Role,
    staff: Db.readSheetAsObjects(SHEET_NAMES.USERS).filter(function (u) { return u.Active; }).map(function (u) {
      return { email: u.Email, name: u.Name };
    }),
    constants: getConstants(),
  };
}

function getConstants() {
  return {
    CATEGORIES: ['Clinical Care', 'Billing & Charges', 'Wait Times', 'Staff Conduct', 'Facilities & Environment', 'Communication', 'Privacy / Data Handling', 'Other'],
    SOURCES: ['Phone', 'Email', 'In Person', 'Letter', 'Online Form'],
    SEVERITIES: ['Low', 'Medium', 'High', 'Critical'],
    STATUSES: ['Open', 'In Progress', 'Escalated', 'Resolved', 'Closed'],
    OPEN_STATUSES: ['Open', 'In Progress', 'Escalated'],
    SLA_DAYS: { Critical: 2, High: 5, Medium: 10, Low: 15 },
  };
}

function slaDueDate(createdAt, severity) {
  var days = getConstants().SLA_DAYS[severity] || 10;
  var due = new Date(createdAt.getTime());
  due.setDate(due.getDate() + days);
  return due;
}

// ---- Audit log (namespaced — writers should call Audit.log directly, ----
// never expose a bare top-level "logAudit" that lets a caller forge entries).

var Audit = {
  log: function (action, entityType, entityId, details) {
    var email;
    try { email = getCurrentUserEmail(); } catch (e) { email = 'system'; }
    var sheet = Db.getSheet(SHEET_NAMES.AUDIT_LOG);
    sheet.appendRow([
      new Date(),
      email,
      action,
      entityType,
      entityId || '',
      details ? JSON.stringify(details) : '',
    ]);
  },
};
