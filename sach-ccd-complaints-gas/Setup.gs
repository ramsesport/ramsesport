/**
 * One-time setup. Run runInitialSetup() ONCE from the Apps Script editor
 * (select it in the function dropdown, click Run) before deploying the
 * web app for the first time. Safe to re-run — it only ever creates
 * sheets/headers that don't already exist and never overwrites data.
 *
 * NOTE ON REACHABILITY: like every top-level function in this project,
 * runInitialSetup() and seedDemoData() are technically callable from the
 * deployed web app too (see the note atop Code.gs), not just from the
 * script editor. They're left unguarded deliberately — runInitialSetup()
 * genuinely has to run before any admin exists in the Users sheet (the
 * classic bootstrap chicken-and-egg problem), and both are idempotent /
 * non-destructive (seedDemoData() flatly refuses to run once there's any
 * real data). If your IT team wants zero residual surface after go-live,
 * simply delete this file's contents (or the two function bodies) once
 * setup is done — nothing else in the project calls them.
 */

var COMPLAINTS_HEADERS = [
  'ID', 'Reference', 'PatientName', 'PatientContact', 'Source', 'Category', 'Severity',
  'Description', 'Status', 'AssignedTo', 'CreatedBy', 'CreatedAt', 'DueAt',
  'ResolvedAt', 'ClosedAt', 'Redacted', 'RedactedAt', 'RedactedBy',
];
var NOTES_HEADERS = ['ID', 'ComplaintID', 'AuthorEmail', 'Body', 'CreatedAt'];
var USERS_HEADERS = ['Email', 'Name', 'Role', 'Active', 'CreatedAt'];
var AUDIT_HEADERS = ['Timestamp', 'ActorEmail', 'Action', 'EntityType', 'EntityID', 'Details'];
var REPORT_TEMPLATE_HEADERS = ['ID', 'Name', 'OwnerEmail', 'FiltersJson', 'CreatedAt'];
var CONFIG_HEADERS = ['Key', 'Value'];

function runInitialSetup() {
  var ss = Db.getSs();

  ensureSheet_(ss, SHEET_NAMES.COMPLAINTS, COMPLAINTS_HEADERS);
  ensureSheet_(ss, SHEET_NAMES.NOTES, NOTES_HEADERS);
  ensureSheet_(ss, SHEET_NAMES.USERS, USERS_HEADERS);
  ensureSheet_(ss, SHEET_NAMES.AUDIT_LOG, AUDIT_HEADERS);
  ensureSheet_(ss, SHEET_NAMES.REPORT_TEMPLATES, REPORT_TEMPLATE_HEADERS);
  ensureSheet_(ss, SHEET_NAMES.CONFIG, CONFIG_HEADERS);

  // Remove the default "Sheet1" if it's still there and empty.
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0) ss.deleteSheet(sheet1);

  // First admin = whoever ran setup, so the app is never locked out.
  var users = Db.readSheetAsObjects(SHEET_NAMES.USERS);
  var deployerEmail = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  if (users.length === 0 && deployerEmail) {
    Db.getSheet(SHEET_NAMES.USERS).appendRow([deployerEmail, deployerEmail.split('@')[0], 'admin', true, new Date()]);
  }

  // Report recipients / folder config, only set if missing.
  if (Db.getConfig('ReportRecipients', null) === null) Db.setConfig('ReportRecipients', deployerEmail || '');
  if (Db.getConfig('BackupFolderId', null) === null) Db.setConfig('BackupFolderId', '');
  if (Db.getConfig('ReportsFolderId', null) === null) Db.setConfig('ReportsFolderId', '');

  SpreadsheetApp.flush();
  Logger.log('Setup complete. First admin: ' + deployerEmail);
  return 'Setup complete. First admin: ' + deployerEmail;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = firstRow.join('') !== '';
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#103a5c').setFontColor('#ffffff');
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

/**
 * Optional: run this once after runInitialSetup() if you want a few
 * fictional demo complaints to explore the app with. Never touches
 * existing data — bails out if the Complaints sheet already has rows.
 */
function seedDemoData() {
  var existing = Db.readSheetAsObjects(SHEET_NAMES.COMPLAINTS);
  if (existing.length > 0) {
    Logger.log('Complaints sheet already has data — skipping demo seed.');
    return 'Already has data, skipped.';
  }

  var me = getCurrentUserEmail();
  var demo = [
    { patient: 'Alex Tan (fictional)', contact: 'alex.tan.demo@example.com', source: 'Email', category: 'Clinical Care', severity: 'High', desc: 'Patient reports a delay in receiving test results and says no one followed up for a week.', status: 'In Progress', daysAgo: 3 },
    { patient: 'Priya Nair (fictional)', contact: '+65 9123 4567', source: 'Phone', category: 'Billing & Charges', severity: 'Medium', desc: 'Complainant disputes a charge on their outpatient bill and wants an itemised breakdown.', status: 'Open', daysAgo: 1 },
    { patient: 'Marcus Wong (fictional)', contact: 'marcus.w.demo@example.com', source: 'Online Form', category: 'Wait Times', severity: 'Low', desc: 'Feedback that the clinic waiting time exceeded 90 minutes for a scheduled appointment.', status: 'Resolved', daysAgo: 12, resolvedDaysAgo: 2 },
    { patient: 'Siti Rahman (fictional)', contact: '+65 8888 2222', source: 'In Person', category: 'Staff Conduct', severity: 'Critical', desc: 'Family member alleges a staff member was dismissive and raised their voice during discharge.', status: 'Escalated', daysAgo: 1 },
    { patient: 'David Ong (fictional)', contact: 'david.ong.demo@example.com', source: 'Letter', category: 'Facilities & Environment', severity: 'Low', desc: 'Complaint about cleanliness of the ward washroom.', status: 'Closed', daysAgo: 20, resolvedDaysAgo: 15, closedDaysAgo: 14 },
  ];

  demo.forEach(function (d) {
    var createdAt = new Date(Date.now() - d.daysAgo * 86400000);
    ComplaintsInternal.create({
      patientName: d.patient,
      patientContact: d.contact,
      source: d.source,
      category: d.category,
      severity: d.severity,
      description: d.desc,
      assignedTo: me,
    }, createdAt, d.status, d.resolvedDaysAgo, d.closedDaysAgo);
  });

  Logger.log('Seeded 5 demo complaints.');
  return 'Seeded 5 demo complaints.';
}
