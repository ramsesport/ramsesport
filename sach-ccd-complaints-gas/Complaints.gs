/**
 * Complaint CRUD, SLA/status workflow.
 *
 * Every function LEFT AT THE TOP LEVEL here is client-reachable (see the
 * note atop Code.gs) and starts with requireActiveUser()/requireAdminUser()
 * — there is no path that skips it. Everything else (raw filtering, raw
 * sheet lookups, unvalidated inserts) lives under the ComplaintsInternal
 * namespace so it is NOT independently callable via google.script.run;
 * only the checked top-level functions below can reach it.
 */

var ComplaintsInternal = {
  /** Low-level insert, no auth check — only called by already-checked callers. */
  create: function (data, createdAtOverride, statusOverride, resolvedDaysAgo, closedDaysAgo) {
    var me = getCurrentUserEmail();
    var id = Db.nextId('NextComplaintId');
    var createdAt = createdAtOverride || new Date();
    var status = statusOverride || 'Open';
    var dueAt = slaDueDate(createdAt, data.severity);
    var resolvedAt = resolvedDaysAgo != null ? new Date(Date.now() - resolvedDaysAgo * 86400000) : '';
    var closedAt = closedDaysAgo != null ? new Date(Date.now() - closedDaysAgo * 86400000) : '';

    var obj = {
      ID: id,
      Reference: referenceNo(id),
      PatientName: data.patientName,
      PatientContact: data.patientContact || '',
      Source: data.source,
      Category: data.category,
      Severity: data.severity,
      Description: data.description,
      Status: status,
      AssignedTo: data.assignedTo || '',
      CreatedBy: me,
      CreatedAt: createdAt,
      DueAt: dueAt,
      ResolvedAt: resolvedAt,
      ClosedAt: closedAt,
      Redacted: false,
      RedactedAt: '',
      RedactedBy: '',
    };
    Db.appendRowFromObject(SHEET_NAMES.COMPLAINTS, COMPLAINTS_HEADERS, obj);
    return obj;
  },

  validate: function (data) {
    var c = getConstants();
    if (!data.patientName || String(data.patientName).trim() === '') throw new Error('Patient / complainant name is required.');
    if (String(data.patientName).length > 200) throw new Error('Patient name is too long.');
    if (c.SOURCES.indexOf(data.source) === -1) throw new Error('Unrecognised source.');
    if (c.CATEGORIES.indexOf(data.category) === -1) throw new Error('Unrecognised category.');
    if (c.SEVERITIES.indexOf(data.severity) === -1) throw new Error('Unrecognised severity.');
    if (!data.description || String(data.description).trim() === '') throw new Error('Please describe the complaint.');
    if (String(data.description).length > 5000) throw new Error('Description is too long (5000 characters max).');
  },

  /** filters: { status, category, severity, assignedTo, q, dateFrom, dateTo, limit } — all optional. */
  filter: function (filters) {
    filters = filters || {};
    var rows = Db.readSheetAsObjects(SHEET_NAMES.COMPLAINTS);
    var openStatuses = getConstants().OPEN_STATUSES;
    var now = new Date();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo) : null;

    rows = rows.filter(function (c) {
      if (filters.status && c.Status !== filters.status) return false;
      if (filters.category && c.Category !== filters.category) return false;
      if (filters.severity && c.Severity !== filters.severity) return false;
      if (filters.assignedTo && c.AssignedTo !== filters.assignedTo) return false;
      if (dateFrom && new Date(c.CreatedAt) < dateFrom) return false;
      if (dateTo && new Date(c.CreatedAt) > dateTo) return false;
      if (filters.q) {
        var q = String(filters.q).toLowerCase();
        var hay = (c.Reference + ' ' + c.PatientName + ' ' + c.Description).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    rows.forEach(function (c) {
      c.IsOverdue = openStatuses.indexOf(c.Status) !== -1 && c.DueAt && new Date(c.DueAt).getTime() < now.getTime();
    });

    rows.sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); });
    return rows.slice(0, filters.limit || 300);
  },

  findRow: function (id) {
    var rows = Db.readSheetAsObjects(SHEET_NAMES.COMPLAINTS);
    var c = rows.filter(function (r) { return Number(r.ID) === Number(id); })[0];
    if (!c) throw new Error('That complaint record does not exist.');
    return c;
  },
};

// ---- Public API (client-reachable; each checks auth first) --------------

function addComplaint(formData) {
  requireActiveUser();
  ComplaintsInternal.validate(formData);
  var obj = ComplaintsInternal.create(formData);
  Audit.log('complaint_created', 'complaint', obj.ID, { category: formData.category, severity: formData.severity, source: formData.source });
  return obj;
}

function listComplaints(filters) {
  requireActiveUser();
  return ComplaintsInternal.filter(filters);
}

function getComplaint(id) {
  requireActiveUser();
  var c = ComplaintsInternal.findRow(id);
  var openStatuses = getConstants().OPEN_STATUSES;
  c.IsOverdue = openStatuses.indexOf(c.Status) !== -1 && c.DueAt && new Date(c.DueAt).getTime() < Date.now();
  c.Notes = NotesInternal.list(id);
  return c;
}

function updateComplaintStatus(id, newStatus) {
  requireActiveUser();
  var c = ComplaintsInternal.findRow(id);
  var statuses = getConstants().STATUSES;
  if (statuses.indexOf(newStatus) === -1) throw new Error('Unrecognised status.');

  var update = { Status: newStatus };
  var now = new Date();
  if (newStatus === 'Resolved' && !c.ResolvedAt) update.ResolvedAt = now;
  if (newStatus === 'Closed' && !c.ClosedAt) update.ClosedAt = now;
  if (['Resolved', 'Closed'].indexOf(newStatus) === -1) { update.ResolvedAt = ''; update.ClosedAt = ''; }

  Db.updateRowFromObject(SHEET_NAMES.COMPLAINTS, COMPLAINTS_HEADERS, c._row, update);
  Audit.log('status_changed', 'complaint', id, { from: c.Status, to: newStatus });
  return getComplaint(id);
}

function updateComplaint(id, formData) {
  requireActiveUser();
  ComplaintsInternal.validate(formData);
  var c = ComplaintsInternal.findRow(id);
  if (c.Redacted) throw new Error('This record has been redacted and can no longer be edited.');

  var dueAt = slaDueDate(new Date(c.CreatedAt), formData.severity);
  Db.updateRowFromObject(SHEET_NAMES.COMPLAINTS, COMPLAINTS_HEADERS, c._row, {
    PatientName: formData.patientName,
    PatientContact: formData.patientContact || '',
    Source: formData.source,
    Category: formData.category,
    Severity: formData.severity,
    Description: formData.description,
    AssignedTo: formData.assignedTo || '',
    DueAt: dueAt,
  });
  Audit.log('complaint_updated', 'complaint', id, null);
  return getComplaint(id);
}

// ---- PDPA: redact / erase ----------------------------------------------

function redactComplaint(id) {
  requireAdminUser();
  var c = ComplaintsInternal.findRow(id);
  Db.updateRowFromObject(SHEET_NAMES.COMPLAINTS, COMPLAINTS_HEADERS, c._row, {
    PatientName: '[REDACTED]',
    PatientContact: '[REDACTED]',
    Redacted: true,
    RedactedAt: new Date(),
    RedactedBy: getCurrentUserEmail(),
  });
  Audit.log('complaint_redacted', 'complaint', id, { reason: 'PDPA request' });
  return getComplaint(id);
}

function deleteComplaint(id) {
  requireAdminUser();
  var c = ComplaintsInternal.findRow(id);
  Db.getSheet(SHEET_NAMES.COMPLAINTS).deleteRow(c._row);

  // Delete associated notes too.
  var notesSheet = Db.getSheet(SHEET_NAMES.NOTES);
  var notes = Db.readSheetAsObjects(SHEET_NAMES.NOTES).filter(function (n) { return Number(n.ComplaintID) === Number(id); });
  notes.sort(function (a, b) { return b._row - a._row; }); // delete bottom-up so row numbers stay valid
  notes.forEach(function (n) { notesSheet.deleteRow(n._row); });

  Audit.log('complaint_deleted', 'complaint', id, { reference: c.Reference, reason: 'PDPA erasure request' });
  return { ok: true, reference: c.Reference };
}
