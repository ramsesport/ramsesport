/**
 * Reporting: on-demand PDF reports, a save-able custom report builder,
 * scheduled/automated email reports, and a one-click Excel snapshot
 * export for the eventual M365/OneDrive migration.
 *
 * PDF reports are built as a throwaway Google Doc (easy to lay out a
 * title + summary + table with the built-in DocumentApp API), converted
 * to PDF, saved into a "Reports" folder in Drive, and the intermediate
 * Doc is discarded. Redacted complaints already show "[REDACTED]" for
 * patient name/contact directly in the sheet, so reports respect
 * redaction automatically — there's no separate redaction logic needed
 * here.
 *
 * Formatting/Drive-folder helpers live under ReportsInternal so they
 * aren't independently reachable via google.script.run (see the note
 * atop Code.gs) — every top-level function below checks auth itself,
 * except sendScheduledReport(), which is the time-trigger target and
 * cannot rely on an interactive user session; see its own comment.
 */

var REPORT_FIELD_LABELS = {
  Reference: 'Reference', PatientName: 'Patient / Complainant', Category: 'Category',
  Severity: 'Severity', Status: 'Status', Source: 'Source', AssignedTo: 'Assigned To',
  CreatedAt: 'Created', DueAt: 'SLA Due', ResolvedAt: 'Resolved', ClosedAt: 'Closed',
  Description: 'Description',
};
var DEFAULT_REPORT_FIELDS = ['Reference', 'PatientName', 'Category', 'Severity', 'Status', 'CreatedAt', 'DueAt', 'AssignedTo'];

var ReportsInternal = {
  getOrCreateFolder: function (configKey, folderName) {
    var id = Db.getConfig(configKey, '');
    if (id) {
      try { return DriveApp.getFolderById(id); } catch (e) { /* fall through and recreate */ }
    }
    var folder = DriveApp.createFolder(folderName);
    Db.setConfig(configKey, folder.getId());
    return folder;
  },

  getReportsFolder: function () { return ReportsInternal.getOrCreateFolder('ReportsFolderId', 'SACH CCD Complaints — Reports'); },
  getBackupsFolder: function () { return ReportsInternal.getOrCreateFolder('BackupFolderId', 'SACH CCD Complaints — Backups'); },

  styleTable: function (table, hasHeaderRow) {
    for (var r = 0; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      for (var col = 0; col < row.getNumCells(); col++) {
        var cell = row.getCell(col);
        cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
        if (hasHeaderRow && r === 0) {
          cell.setBackgroundColor('#103a5c');
          cell.editAsText().setForegroundColor('#ffffff').setBold(true).setFontSize(9);
        } else {
          cell.editAsText().setFontSize(9);
        }
      }
    }
  },

  formatCell: function (c, field) {
    var v = c[field];
    if (field === 'CreatedAt' || field === 'DueAt' || field === 'ResolvedAt' || field === 'ClosedAt') {
      return v ? Utilities.formatDate(new Date(v), 'Asia/Singapore', 'dd MMM yyyy') : '—';
    }
    return v === '' || v == null ? '—' : String(v);
  },

  formatCounts: function (map) {
    return Object.keys(map).map(function (k) { return k + ': ' + map[k]; }).join('   ·   ');
  },

  describeFilters: function (filters) {
    filters = filters || {};
    var parts = [];
    if (filters.status) parts.push('status = ' + filters.status);
    if (filters.category) parts.push('category = ' + filters.category);
    if (filters.severity) parts.push('severity = ' + filters.severity);
    if (filters.assignedTo) parts.push('assigned to ' + filters.assignedTo);
    if (filters.dateFrom) parts.push('from ' + filters.dateFrom);
    if (filters.dateTo) parts.push('to ' + filters.dateTo);
    if (filters.q) parts.push('search "' + filters.q + '"');
    return parts.length ? 'Filters: ' + parts.join(', ') : 'Filters: none (all complaints)';
  },

  summarize: function (complaints) {
    var c = getConstants();
    var byStatus = {}, bySeverity = {}, overdue = 0, open = 0, sum = 0, n = 0;
    var now = Date.now();
    complaints.forEach(function (comp) {
      byStatus[comp.Status] = (byStatus[comp.Status] || 0) + 1;
      bySeverity[comp.Severity] = (bySeverity[comp.Severity] || 0) + 1;
      if (c.OPEN_STATUSES.indexOf(comp.Status) !== -1) {
        open++;
        if (comp.DueAt && new Date(comp.DueAt).getTime() < now) overdue++;
      }
      if (comp.ResolvedAt) { sum += (new Date(comp.ResolvedAt) - new Date(comp.CreatedAt)) / 86400000; n++; }
    });
    return {
      total: complaints.length, byStatus: byStatus, bySeverity: bySeverity,
      overdue: overdue, open: open, avgResolutionDays: n ? (sum / n).toFixed(1) : null,
    };
  },

  /** Builds the Doc → PDF, saves it in the Reports folder, returns the Drive file. */
  buildPdf: function (title, complaints, fields, filters) {
    var stats = ReportsInternal.summarize(complaints);
    var doc = DocumentApp.create(title + ' — ' + Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd HHmm'));
    var body = doc.getBody();
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(48).setMarginRight(48);

    body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.TITLE);
    var byline = 'Generated ' + Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd MMM yyyy, HH:mm');
    try { byline += ' by ' + getCurrentUserEmail(); } catch (e) { byline += ' (automated)'; }
    body.appendParagraph(byline).setFontSize(9).setForegroundColor('#5a6673');
    if (filters) body.appendParagraph(ReportsInternal.describeFilters(filters)).setFontSize(9).setForegroundColor('#5a6673');
    body.appendParagraph('');

    body.appendParagraph('Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    ReportsInternal.styleTable(body.appendTable([
      ['Total in this report', String(stats.total)],
      ['Overdue (past SLA)', String(stats.overdue)],
      ['Currently open', String(stats.open)],
      ['Avg. resolution time', stats.avgResolutionDays !== null ? stats.avgResolutionDays + ' days' : 'n/a'],
    ]));
    body.appendParagraph('');
    body.appendParagraph('By status: ' + ReportsInternal.formatCounts(stats.byStatus)).setFontSize(10);
    body.appendParagraph('By severity: ' + ReportsInternal.formatCounts(stats.bySeverity)).setFontSize(10);
    body.appendParagraph('');

    body.appendParagraph('Cases (' + complaints.length + ')').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (complaints.length === 0) {
      body.appendParagraph('No complaints match these filters.');
    } else {
      var tableData = [fields.map(function (f) { return REPORT_FIELD_LABELS[f] || f; })];
      complaints.forEach(function (c) { tableData.push(fields.map(function (f) { return ReportsInternal.formatCell(c, f); })); });
      ReportsInternal.styleTable(body.appendTable(tableData), true);
    }

    doc.saveAndClose();
    var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(doc.getName() + '.pdf');
    var pdfFile = ReportsInternal.getReportsFolder().createFile(pdfBlob);
    DriveApp.getFileById(doc.getId()).setTrashed(true); // keep only the PDF
    return pdfFile;
  },
};

// ---- Public API (client-reachable; each checks auth first) --------------

function getReportFieldOptions() {
  requireActiveUser();
  return Object.keys(REPORT_FIELD_LABELS).map(function (k) { return { key: k, label: REPORT_FIELD_LABELS[k] }; });
}

/**
 * filters: same shape as listComplaints (status/category/severity/
 *   assignedTo/dateFrom/dateTo/q). fields: array of REPORT_FIELD_LABELS
 *   keys to include as table columns (defaults to DEFAULT_REPORT_FIELDS).
 */
function generatePdfReport(filters, fields, reportTitle) {
  requireActiveUser();
  fields = (fields && fields.length) ? fields : DEFAULT_REPORT_FIELDS;
  var complaints = ComplaintsInternal.filter(Object.assign({}, filters, { limit: 2000 }));
  var title = reportTitle || 'SACH Corp CCD — Patient Complaints Report';
  var pdfFile = ReportsInternal.buildPdf(title, complaints, fields, filters);

  Audit.log('report_generated', 'report', null, { fields: fields, filters: filters, rows: complaints.length, fileId: pdfFile.getId() });
  return { url: pdfFile.getUrl(), id: pdfFile.getId(), name: pdfFile.getName() };
}

// ---- Saved report templates ---------------------------------------------

function listReportTemplates() {
  requireActiveUser();
  return Db.readSheetAsObjects(SHEET_NAMES.REPORT_TEMPLATES).sort(function (a, b) {
    return new Date(b.CreatedAt) - new Date(a.CreatedAt);
  });
}

function saveReportTemplate(name, filters, fields) {
  var user = requireActiveUser();
  name = String(name || '').trim();
  if (!name) throw new Error('Give the report template a name.');
  var id = Db.nextId('NextReportTemplateId');
  Db.appendRowFromObject(SHEET_NAMES.REPORT_TEMPLATES, REPORT_TEMPLATE_HEADERS, {
    ID: id, Name: name, OwnerEmail: user.Email,
    FiltersJson: JSON.stringify({ filters: filters || {}, fields: fields || DEFAULT_REPORT_FIELDS }),
    CreatedAt: new Date(),
  });
  Audit.log('report_template_saved', 'report_template', id, { name: name });
  return listReportTemplates();
}

function deleteReportTemplate(id) {
  var user = requireActiveUser();
  var rows = Db.readSheetAsObjects(SHEET_NAMES.REPORT_TEMPLATES);
  var tpl = rows.filter(function (t) { return Number(t.ID) === Number(id); })[0];
  if (!tpl) throw new Error('Template not found.');
  if (tpl.OwnerEmail !== user.Email && user.Role !== 'admin') {
    throw new Error('Only the owner or an admin can delete this template.');
  }
  Db.getSheet(SHEET_NAMES.REPORT_TEMPLATES).deleteRow(tpl._row);
  return listReportTemplates();
}

// ---- Scheduled / automated email reports ---------------------------------

function getReportRecipients() {
  requireAdminUser();
  return String(Db.getConfig('ReportRecipients', '') || '');
}

function setReportRecipients(csvEmails) {
  requireAdminUser();
  Db.setConfig('ReportRecipients', String(csvEmails || '').trim());
  Audit.log('report_recipients_updated', 'config', null, { recipients: csvEmails });
  return getReportRecipients();
}

/** Admin-configurable weekly trigger. Removes any prior trigger for the same function first (idempotent). */
function setupWeeklyReportTrigger(weekDay, hour) {
  requireAdminUser();
  removeScheduledReportTrigger();
  ScriptApp.newTrigger('sendScheduledReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay[weekDay || 'MONDAY'])
    .atHour(hour != null ? hour : 8)
    .create();
  Audit.log('report_trigger_created', 'config', null, { weekDay: weekDay, hour: hour });
  return listScheduledReportTriggers();
}

function removeScheduledReportTrigger() {
  requireAdminUser();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendScheduledReport') ScriptApp.deleteTrigger(t);
  });
  return listScheduledReportTriggers();
}

function listScheduledReportTriggers() {
  requireAdminUser();
  return ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sendScheduledReport'; })
    .map(function (t) { return { id: t.getUniqueId(), type: String(t.getEventType()) }; });
}

/**
 * The trigger target — Apps Script calls this by exact function name, so
 * it must stay a top-level declaration (can't be namespaced away like
 * the helpers above). It therefore IS technically callable directly via
 * google.script.run too, by any signed-in domain user. The impact of
 * that is low and was a deliberate tradeoff, not an oversight: it can't
 * leak data back to a caller (MailApp.sendEmail has no return value),
 * and it only emails whoever is already configured in
 * Config!ReportRecipients — never an address the caller controls. Worst
 * case is an extra/early email to those recipients. Runs with the
 * Drive/Gmail/Docs authority of whichever admin created the trigger
 * (standard Apps Script trigger behavior) — if that admin's account is
 * ever deactivated, an admin needs to re-run setupWeeklyReportTrigger()
 * to re-arm it under a current account.
 */
function sendScheduledReport() {
  var recipients = String(Db.getConfig('ReportRecipients', '') || '').trim();
  if (!recipients) {
    Logger.log('sendScheduledReport: no recipients configured, skipping.');
    return;
  }
  var complaints = ComplaintsInternal.filter({ limit: 2000 });
  var stats = ReportsInternal.summarize(complaints);
  var pdfFile = ReportsInternal.buildPdf('SACH Corp CCD — Weekly Complaints Report', complaints, DEFAULT_REPORT_FIELDS, null);

  MailApp.sendEmail({
    to: recipients,
    subject: 'SACH Corp CCD — Weekly Complaints Report',
    body: 'Attached: the automated weekly patient complaints report from the CCD Complaints CRM.\n\n' +
      'Total: ' + stats.total + ' | Open: ' + stats.open + ' | Overdue: ' + stats.overdue,
    attachments: [pdfFile.getAs('application/pdf')],
  });
  Audit.log('scheduled_report_sent', 'report', null, { recipients: recipients, rows: complaints.length });
}

// ---- M365 migration: Excel snapshot export --------------------------------

/**
 * Saves a full .xlsx copy of the entire spreadsheet (all sheets) into the
 * Backups Drive folder, timestamped. This is the file to hand off — or
 * drag into OneDrive/SharePoint — when SACH Corp moves to M365. Uses the
 * script's own OAuth token to call Drive's native Sheets→xlsx export.
 */
function exportXlsxSnapshot() {
  requireAdminUser();
  var ss = Db.getSs();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  });
  var fileName = 'SACH_CCD_Complaints_Backup_' + Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd_HHmm') + '.xlsx';
  var blob = response.getBlob().setName(fileName);
  var file = ReportsInternal.getBackupsFolder().createFile(blob);
  Audit.log('backup_exported', 'report', null, { fileId: file.getId(), fileName: fileName });
  return { url: file.getUrl(), id: file.getId(), name: file.getName() };
}
