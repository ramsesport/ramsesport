'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { CATEGORIES, SOURCES, SEVERITIES, slaDueDate } = require('./lib/constants');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'complaints.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const isNewDatabase = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema -----------------------------------------------------------
// All tables are created with IF NOT EXISTS so restarting the app never
// touches existing data. There is no separate migration runner: this is
// a small, single-purpose app, and one schema file that's easy to read
// beats a migration framework nobody on the team will maintain.

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('staff','admin')),
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_no TEXT NOT NULL UNIQUE,
    patient_name TEXT NOT NULL,
    patient_contact TEXT,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_at TEXT NOT NULL,
    resolved_at TEXT,
    closed_at TEXT,
    redacted INTEGER NOT NULL DEFAULT 0,
    redacted_at TEXT,
    redacted_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS complaint_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id),
    actor_label TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
  CREATE INDEX IF NOT EXISTS idx_complaints_assigned ON complaints(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_complaint_notes_complaint ON complaint_notes(complaint_id);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
`);

function logAudit({ actorId = null, actorLabel = null, action, entityType, entityId = null, details = null }) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, actor_label, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actorId, actorLabel, action, entityType, entityId, details ? JSON.stringify(details) : null);
}

function referenceNo(id) {
  return `CCD-${String(id).padStart(5, '0')}`;
}

// --- Seed data ----------------------------------------------------------
// Only ever runs the first time the database file is created, and only
// if SEED_DEMO_DATA is not explicitly disabled. Never overwrites data on
// an existing database, so it's safe to leave enabled.

function seedIfEmpty() {
  const seedEnabled = (process.env.SEED_DEMO_DATA || 'true').toLowerCase() !== 'false';
  if (!isNewDatabase || !seedEnabled) return;

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  const crypto = require('node:crypto');
  const adminPassword = crypto.randomBytes(9).toString('base64url');
  const staffPassword = crypto.randomBytes(9).toString('base64url');

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)`
  );
  const adminId = insertUser.run(
    'CCD Administrator',
    'admin@sach-corp.example',
    bcrypt.hashSync(adminPassword, 12),
    'admin'
  ).lastInsertRowid;
  const staffId = insertUser.run(
    'Jamie Lee (Demo Staff)',
    'staff@sach-corp.example',
    bcrypt.hashSync(staffPassword, 12),
    'staff'
  ).lastInsertRowid;

  const insertComplaint = db.prepare(`
    INSERT INTO complaints
      (reference_no, patient_name, patient_contact, source, category, severity, description,
       status, assigned_to, created_by, created_at, due_at, resolved_at, closed_at)
    VALUES (@reference_no, @patient_name, @patient_contact, @source, @category, @severity, @description,
       @status, @assigned_to, @created_by, @created_at, @due_at, @resolved_at, @closed_at)
  `);

  const demoComplaints = [
    {
      patient_name: 'Alex Tan (fictional)',
      patient_contact: 'alex.tan.demo@example.com',
      source: SOURCES[1],
      category: CATEGORIES[0],
      severity: 'High',
      description: 'Patient reports a delay in receiving test results and says no one followed up for a week.',
      status: 'In Progress',
      assigned_to: staffId,
      daysAgo: 3,
    },
    {
      patient_name: 'Priya Nair (fictional)',
      patient_contact: '+65 9123 4567',
      source: SOURCES[0],
      category: CATEGORIES[1],
      severity: 'Medium',
      description: 'Complainant disputes a charge on their outpatient bill and wants an itemised breakdown.',
      status: 'Open',
      assigned_to: null,
      daysAgo: 1,
    },
    {
      patient_name: 'Marcus Wong (fictional)',
      patient_contact: 'marcus.w.demo@example.com',
      source: SOURCES[4],
      category: CATEGORIES[2],
      severity: 'Low',
      description: 'Feedback that the clinic waiting time exceeded 90 minutes for a scheduled appointment.',
      status: 'Resolved',
      assigned_to: staffId,
      daysAgo: 12,
      resolvedDaysAgo: 2,
    },
    {
      patient_name: 'Siti Rahman (fictional)',
      patient_contact: '+65 8888 2222',
      source: SOURCES[2],
      category: CATEGORIES[3],
      severity: 'Critical',
      description: 'Family member alleges a staff member was dismissive and raised their voice during discharge.',
      status: 'Escalated',
      assigned_to: adminId,
      daysAgo: 1,
    },
    {
      patient_name: 'David Ong (fictional)',
      patient_contact: 'david.ong.demo@example.com',
      source: SOURCES[3],
      category: CATEGORIES[4],
      severity: 'Low',
      description: 'Complaint about cleanliness of the ward washroom.',
      status: 'Closed',
      assigned_to: staffId,
      daysAgo: 20,
      resolvedDaysAgo: 15,
      closedDaysAgo: 14,
    },
  ];

  for (const c of demoComplaints) {
    const createdAt = new Date(Date.now() - c.daysAgo * 86400000);
    const due = slaDueDate(createdAt, c.severity);
    const resolvedAt = c.resolvedDaysAgo != null ? new Date(Date.now() - c.resolvedDaysAgo * 86400000) : null;
    const closedAt = c.closedDaysAgo != null ? new Date(Date.now() - c.closedDaysAgo * 86400000) : null;

    const info = insertComplaint.run({
      reference_no: 'TEMP',
      patient_name: c.patient_name,
      patient_contact: c.patient_contact,
      source: c.source,
      category: c.category,
      severity: c.severity,
      description: c.description,
      status: c.status,
      assigned_to: c.assigned_to,
      created_by: adminId,
      created_at: createdAt.toISOString(),
      due_at: due.toISOString(),
      resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
      closed_at: closedAt ? closedAt.toISOString() : null,
    });
    db.prepare('UPDATE complaints SET reference_no = ? WHERE id = ?').run(referenceNo(info.lastInsertRowid), info.lastInsertRowid);
  }

  db.prepare(`INSERT INTO complaint_notes (complaint_id, author_id, body) VALUES (1, ?, ?)`).run(
    staffId,
    'Called complainant to acknowledge receipt and requested more detail on the timeline.'
  );

  logAudit({ actorLabel: 'system', action: 'seed', entityType: 'system', details: { note: 'Initial demo data seeded' } });

  const credsPath = path.join(path.dirname(DB_PATH), 'SEED_CREDENTIALS.txt');
  const contents = [
    'SACH Corp CCD Patient Complaints CRM — first-run seed credentials',
    'Generated once when the database was first created. This file is gitignored.',
    'Both accounts are forced to change their password on first login.',
    '',
    `Admin login:  admin@sach-corp.example / ${adminPassword}`,
    `Staff login:  staff@sach-corp.example / ${staffPassword}`,
    '',
    'Delete this file after recording the credentials somewhere safe.',
    '',
  ].join('\n');
  fs.writeFileSync(credsPath, contents, { mode: 0o600 });

  // eslint-disable-next-line no-console
  console.log(`\nFirst run: demo accounts created. Credentials written to ${credsPath}\n`);
}

seedIfEmpty();

module.exports = { db, logAudit, referenceNo };
