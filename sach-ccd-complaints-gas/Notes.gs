/**
 * Communication log / notes timeline. Append-only by design — notes are
 * never edited or deleted individually (matches the audit trail intent);
 * the whole complaint (and its notes) can only be removed via the
 * admin-only deleteComplaint() PDPA erasure path in Complaints.gs.
 */

var NotesInternal = {
  /** No auth check — only called by already-checked callers (getComplaint, addNote). */
  list: function (complaintId) {
    var rows = Db.readSheetAsObjects(SHEET_NAMES.NOTES);
    var notes = rows.filter(function (n) { return Number(n.ComplaintID) === Number(complaintId); });
    notes.sort(function (a, b) { return new Date(a.CreatedAt) - new Date(b.CreatedAt); });
    return notes;
  },
};

// ---- Public API (client-reachable) ---------------------------------

function addNote(complaintId, body) {
  var user = requireActiveUser();
  body = String(body || '').trim();
  if (!body) throw new Error('Note cannot be empty.');
  if (body.length > 4000) throw new Error('Note is too long (4000 characters max).');

  ComplaintsInternal.findRow(complaintId); // throws if the complaint doesn't exist

  var id = Db.nextId('NextNoteId');
  Db.appendRowFromObject(SHEET_NAMES.NOTES, NOTES_HEADERS, {
    ID: id,
    ComplaintID: complaintId,
    AuthorEmail: user.Email,
    Body: body,
    CreatedAt: new Date(),
  });
  Audit.log('note_added', 'complaint', complaintId, null);
  return NotesInternal.list(complaintId);
}
