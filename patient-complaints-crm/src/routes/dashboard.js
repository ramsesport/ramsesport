'use strict';

const express = require('express');
const { db, logAudit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { STATUSES, OPEN_STATUSES } = require('../lib/constants');

const router = express.Router();
router.use(requireAuth);

router.get('/dashboard', (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status').all();
  const byCategory = db.prepare('SELECT category, COUNT(*) AS n FROM complaints GROUP BY category ORDER BY n DESC').all();
  const bySeverity = db.prepare('SELECT severity, COUNT(*) AS n FROM complaints GROUP BY severity').all();

  const openPlaceholders = OPEN_STATUSES.map(() => '?').join(',');
  const overdue = db
    .prepare(`SELECT COUNT(*) AS n FROM complaints WHERE status IN (${openPlaceholders}) AND due_at < datetime('now')`)
    .get(...OPEN_STATUSES).n;

  const avgResolutionDays = db
    .prepare(`
      SELECT AVG(julianday(resolved_at) - julianday(created_at)) AS avg_days
      FROM complaints
      WHERE resolved_at IS NOT NULL
    `)
    .get().avg_days;

  const total = db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n;

  const recentActivity = db
    .prepare(`
      SELECT al.*, u.name AS actor_name, c.reference_no
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.actor_id
      LEFT JOIN complaints c ON al.entity_type = 'complaint' AND c.id = al.entity_id
      ORDER BY al.created_at DESC
      LIMIT 15
    `)
    .all();

  const statusMap = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) statusMap[row.status] = row.n;

  res.render('dashboard', {
    title: 'Dashboard',
    total,
    statusMap,
    byCategory,
    bySeverity,
    overdue,
    avgResolutionDays: avgResolutionDays != null ? avgResolutionDays.toFixed(1) : null,
    recentActivity,
  });
});

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.get('/reports/export.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT c.reference_no, c.status, c.category, c.severity, c.source, c.patient_name,
           c.created_at, c.due_at, c.resolved_at, c.closed_at, a.name AS assigned_name
    FROM complaints c
    LEFT JOIN users a ON a.id = c.assigned_to
    ORDER BY c.created_at DESC
  `).all();

  const header = ['Reference', 'Status', 'Category', 'Severity', 'Source', 'Patient/Complainant', 'Created', 'Due', 'Resolved', 'Closed', 'Assigned to'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.reference_no, r.status, r.category, r.severity, r.source, r.patient_name,
      r.created_at, r.due_at, r.resolved_at, r.closed_at, r.assigned_name,
    ].map(csvEscape).join(','));
  }

  logAudit({ actorId: req.user.id, action: 'report_exported', entityType: 'report', details: { rows: rows.length } });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="complaints-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
