'use strict';

const express = require('express');
const { body, query, param } = require('express-validator');
const { db, logAudit, referenceNo } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { handleValidation } = require('../middleware/validate');
const { CATEGORIES, SOURCES, SEVERITIES, STATUSES, OPEN_STATUSES, slaDueDate } = require('../lib/constants');

const router = express.Router();
router.use(requireAuth);

const staffList = () => db.prepare("SELECT id, name FROM users WHERE active = 1 ORDER BY name").all();

const getComplaintById = db.prepare(`
  SELECT c.*, a.name AS assigned_name, cr.name AS created_by_name
  FROM complaints c
  LEFT JOIN users a ON a.id = c.assigned_to
  JOIN users cr ON cr.id = c.created_by
  WHERE c.id = ?
`);

const getNotes = db.prepare(`
  SELECT n.*, u.name AS author_name
  FROM complaint_notes n
  JOIN users u ON u.id = n.author_id
  WHERE n.complaint_id = ?
  ORDER BY n.created_at ASC
`);

function withOverdue(c) {
  const isOpen = OPEN_STATUSES.includes(c.status);
  const overdue = isOpen && new Date(c.due_at).getTime() < Date.now();
  return { ...c, isOverdue: overdue };
}

// --- List / filter -------------------------------------------------------

router.get(
  '/complaints',
  query('status').optional().isIn(STATUSES),
  query('category').optional().isIn(CATEGORIES),
  query('severity').optional().isIn(SEVERITIES),
  query('assignedTo').optional().isInt(),
  query('q').optional().isLength({ max: 200 }),
  handleValidation((req, res) => res.status(400).render('error', { title: 'Invalid filter', message: 'One of the filter values was not recognised.' })),
  (req, res) => {
    const { status, category, severity, assignedTo, q } = req.query;

    const clauses = [];
    const params = [];
    if (status) { clauses.push('c.status = ?'); params.push(status); }
    if (category) { clauses.push('c.category = ?'); params.push(category); }
    if (severity) { clauses.push('c.severity = ?'); params.push(severity); }
    if (assignedTo) { clauses.push('c.assigned_to = ?'); params.push(assignedTo); }
    if (q) {
      clauses.push('(c.reference_no LIKE ? OR c.patient_name LIKE ? OR c.description LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db
      .prepare(`
        SELECT c.*, a.name AS assigned_name
        FROM complaints c
        LEFT JOIN users a ON a.id = c.assigned_to
        ${where}
        ORDER BY c.created_at DESC
        LIMIT 200
      `)
      .all(...params)
      .map(withOverdue);

    res.render('complaints/list', {
      title: 'Complaints',
      complaints: rows,
      filters: { status: status || '', category: category || '', severity: severity || '', assignedTo: assignedTo || '', q: q || '' },
      CATEGORIES, SEVERITIES, STATUSES,
      staff: staffList(),
    });
  }
);

// --- New -------------------------------------------------------------

router.get('/complaints/new', (req, res) => {
  res.render('complaints/new', {
    title: 'Log a new complaint',
    CATEGORIES, SOURCES, SEVERITIES,
    staff: staffList(),
    error: null,
    values: {},
  });
});

const complaintCreateValidators = [
  body('patient_name').trim().isLength({ min: 1, max: 200 }).withMessage('Patient / complainant name is required.'),
  body('patient_contact').trim().isLength({ max: 200 }).optional({ values: 'falsy' }),
  body('source').isIn(SOURCES),
  body('category').isIn(CATEGORIES),
  body('severity').isIn(SEVERITIES),
  body('description').trim().isLength({ min: 1, max: 5000 }).withMessage('Please describe the complaint.'),
  body('assigned_to').optional({ values: 'falsy' }).isInt(),
];

router.post(
  '/complaints',
  verifyCsrfToken,
  complaintCreateValidators,
  handleValidation((req, res, errors) =>
    res.status(400).render('complaints/new', {
      title: 'Log a new complaint',
      CATEGORIES, SOURCES, SEVERITIES,
      staff: staffList(),
      error: errors[0].msg,
      values: req.body,
    })
  ),
  (req, res) => {
    const { patient_name, patient_contact, source, category, severity, description, assigned_to } = req.body;
    const createdAt = new Date();
    const dueAt = slaDueDate(createdAt, severity);

    const info = db.prepare(`
      INSERT INTO complaints
        (reference_no, patient_name, patient_contact, source, category, severity, description,
         status, assigned_to, created_by, created_at, due_at)
      VALUES ('TEMP', ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?)
    `).run(
      patient_name, patient_contact || null, source, category, severity, description,
      assigned_to || null, req.user.id, createdAt.toISOString(), dueAt.toISOString()
    );
    const id = info.lastInsertRowid;
    db.prepare('UPDATE complaints SET reference_no = ? WHERE id = ?').run(referenceNo(id), id);

    logAudit({ actorId: req.user.id, action: 'complaint_created', entityType: 'complaint', entityId: id, details: { category, severity, source } });
    req.flash('success', `Complaint ${referenceNo(id)} logged.`);
    res.redirect(`/complaints/${id}`);
  }
);

// --- Detail ------------------------------------------------------------

router.get('/complaints/:id', param('id').isInt(), (req, res) => {
  const complaint = getComplaintById.get(req.params.id);
  if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });

  const notes = getNotes.all(req.params.id);
  res.render('complaints/detail', {
    title: complaint.reference_no,
    complaint: withOverdue(complaint),
    notes,
    STATUSES,
    staff: staffList(),
  });
});

// --- Notes ---------------------------------------------------------------

router.post(
  '/complaints/:id/notes',
  verifyCsrfToken,
  param('id').isInt(),
  body('body').trim().isLength({ min: 1, max: 4000 }).withMessage('Note cannot be empty.'),
  handleValidation((req, res) => {
    req.flash('error', 'Note cannot be empty.');
    res.redirect(`/complaints/${req.params.id}`);
  }),
  (req, res) => {
    const complaint = getComplaintById.get(req.params.id);
    if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });

    db.prepare('INSERT INTO complaint_notes (complaint_id, author_id, body) VALUES (?, ?, ?)').run(
      req.params.id, req.user.id, req.body.body
    );
    logAudit({ actorId: req.user.id, action: 'note_added', entityType: 'complaint', entityId: Number(req.params.id) });
    res.redirect(`/complaints/${req.params.id}`);
  }
);

// --- Status workflow -------------------------------------------------

router.post(
  '/complaints/:id/status',
  verifyCsrfToken,
  param('id').isInt(),
  body('status').isIn(STATUSES),
  handleValidation((req, res) => {
    req.flash('error', 'Unrecognised status.');
    res.redirect(`/complaints/${req.params.id}`);
  }),
  (req, res) => {
    const complaint = getComplaintById.get(req.params.id);
    if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });

    const newStatus = req.body.status;
    const now = new Date().toISOString();
    const fields = { status: newStatus };
    if (newStatus === 'Resolved' && !complaint.resolved_at) fields.resolved_at = now;
    if (newStatus === 'Closed' && !complaint.closed_at) fields.closed_at = now;
    // Moving back out of a terminal state clears the terminal timestamps.
    if (!['Resolved', 'Closed'].includes(newStatus)) { fields.resolved_at = null; fields.closed_at = null; }

    const setSql = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE complaints SET ${setSql} WHERE id = @id`).run({ ...fields, id: req.params.id });

    logAudit({
      actorId: req.user.id, action: 'status_changed', entityType: 'complaint', entityId: Number(req.params.id),
      details: { from: complaint.status, to: newStatus },
    });
    req.flash('success', `Status updated to ${newStatus}.`);
    res.redirect(`/complaints/${req.params.id}`);
  }
);

// --- Edit core fields / triage -----------------------------------------

router.get('/complaints/:id/edit', param('id').isInt(), (req, res) => {
  const complaint = getComplaintById.get(req.params.id);
  if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });
  res.render('complaints/edit', {
    title: `Edit ${complaint.reference_no}`,
    complaint, CATEGORIES, SOURCES, SEVERITIES,
    staff: staffList(),
    error: null,
  });
});

router.post(
  '/complaints/:id/edit',
  verifyCsrfToken,
  param('id').isInt(),
  complaintCreateValidators,
  handleValidation((req, res, errors) => {
    const complaint = getComplaintById.get(req.params.id);
    res.status(400).render('complaints/edit', {
      title: `Edit ${complaint.reference_no}`,
      complaint: { ...complaint, ...req.body },
      CATEGORIES, SOURCES, SEVERITIES,
      staff: staffList(),
      error: errors[0].msg,
    });
  }),
  (req, res) => {
    const complaint = getComplaintById.get(req.params.id);
    if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });
    if (complaint.redacted) {
      req.flash('error', 'This record has been redacted and can no longer be edited.');
      return res.redirect(`/complaints/${req.params.id}`);
    }

    const { patient_name, patient_contact, source, category, severity, description, assigned_to } = req.body;
    // Severity changes recompute the SLA due date from the original creation time.
    const dueAt = slaDueDate(new Date(complaint.created_at), severity);

    db.prepare(`
      UPDATE complaints SET
        patient_name = ?, patient_contact = ?, source = ?, category = ?, severity = ?,
        description = ?, assigned_to = ?, due_at = ?
      WHERE id = ?
    `).run(patient_name, patient_contact || null, source, category, severity, description, assigned_to || null, dueAt.toISOString(), req.params.id);

    logAudit({ actorId: req.user.id, action: 'complaint_updated', entityType: 'complaint', entityId: Number(req.params.id) });
    req.flash('success', 'Complaint updated.');
    res.redirect(`/complaints/${req.params.id}`);
  }
);

// --- PDPA: redact / erase ------------------------------------------------

router.post('/complaints/:id/redact', requireAdmin, verifyCsrfToken, param('id').isInt(), (req, res) => {
  const complaint = getComplaintById.get(req.params.id);
  if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });

  db.prepare(`
    UPDATE complaints SET patient_name = '[REDACTED]', patient_contact = '[REDACTED]',
      redacted = 1, redacted_at = datetime('now'), redacted_by = ?
    WHERE id = ?
  `).run(req.user.id, req.params.id);

  logAudit({ actorId: req.user.id, action: 'complaint_redacted', entityType: 'complaint', entityId: Number(req.params.id), details: { reason: 'PDPA request' } });
  req.flash('success', 'Patient identifying details have been redacted from this record.');
  res.redirect(`/complaints/${req.params.id}`);
});

router.post('/complaints/:id/delete', requireAdmin, verifyCsrfToken, param('id').isInt(), (req, res) => {
  const complaint = getComplaintById.get(req.params.id);
  if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'That complaint record does not exist.' });

  db.prepare('DELETE FROM complaints WHERE id = ?').run(req.params.id);
  // Keep a non-identifying trace that the erasure happened, without retaining the PII itself.
  logAudit({ actorId: req.user.id, action: 'complaint_deleted', entityType: 'complaint', entityId: Number(req.params.id), details: { reference_no: complaint.reference_no, reason: 'PDPA erasure request' } });
  req.flash('success', `${complaint.reference_no} has been permanently deleted.`);
  res.redirect('/complaints');
});

module.exports = router;
