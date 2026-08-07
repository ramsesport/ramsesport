'use strict';

const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { db, logAudit } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { handleValidation } = require('../middleware/validate');
const { ROLES } = require('../lib/constants');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/admin/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, active, must_change_password, created_at FROM users ORDER BY name').all();
  res.render('admin/users', { title: 'Manage staff accounts', users, error: null, tempPassword: null });
});

router.post(
  '/admin/users',
  verifyCsrfToken,
  body('name').trim().isLength({ min: 1, max: 200 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('role').isIn(ROLES),
  handleValidation((req, res, errors) => {
    const users = db.prepare('SELECT id, name, email, role, active, must_change_password, created_at FROM users ORDER BY name').all();
    res.status(400).render('admin/users', { title: 'Manage staff accounts', users, error: errors[0].msg, tempPassword: null });
  }),
  async (req, res) => {
    const { name, email, role } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      const users = db.prepare('SELECT id, name, email, role, active, must_change_password, created_at FROM users ORDER BY name').all();
      return res.status(400).render('admin/users', { title: 'Manage staff accounts', users, error: 'That email is already registered.', tempPassword: null });
    }

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 12);
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
    ).run(name, email, hash, role);

    logAudit({ actorId: req.user.id, action: 'user_created', entityType: 'user', entityId: info.lastInsertRowid, details: { role } });

    const users = db.prepare('SELECT id, name, email, role, active, must_change_password, created_at FROM users ORDER BY name').all();
    res.render('admin/users', {
      title: 'Manage staff accounts',
      users,
      error: null,
      tempPassword: { email, password: tempPassword },
    });
  }
);

router.post('/admin/users/:id/toggle-active', verifyCsrfToken, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).render('error', { title: 'Not found', message: 'No such user.' });
  if (target.id === req.user.id) {
    req.flash('error', 'You cannot deactivate your own account.');
    return res.redirect('/admin/users');
  }
  const newActive = target.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newActive, target.id);
  logAudit({ actorId: req.user.id, action: newActive ? 'user_activated' : 'user_deactivated', entityType: 'user', entityId: target.id });
  res.redirect('/admin/users');
});

router.post(
  '/admin/users/:id/role',
  verifyCsrfToken,
  body('role').isIn(ROLES),
  handleValidation((req, res) => {
    req.flash('error', 'Invalid role.');
    res.redirect('/admin/users');
  }),
  (req, res) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).render('error', { title: 'Not found', message: 'No such user.' });
    if (target.id === req.user.id) {
      req.flash('error', 'You cannot change your own role.');
      return res.redirect('/admin/users');
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, target.id);
    logAudit({ actorId: req.user.id, action: 'user_role_changed', entityType: 'user', entityId: target.id, details: { to: req.body.role } });
    res.redirect('/admin/users');
  }
);

router.get('/admin/audit', (req, res) => {
  const entries = db.prepare(`
    SELECT al.*, u.name AS actor_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT 300
  `).all();
  res.render('admin/audit', { title: 'Audit log', entries });
});

module.exports = router;
