'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { db, logAudit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

const updatePassword = db.prepare(
  'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
);

// Note: this route is reachable even when must_change_password forces a
// redirect here from requireAuth, so it must NOT itself be gated behind
// that same check (it isn't — it's mounted after requireAuth but the
// path is explicitly excluded in that middleware).
router.get('/account/password', requireAuth, (req, res) => {
  res.render('account/password', { title: 'Change password', error: null, forced: !!req.user.must_change_password });
});

router.post(
  '/account/password',
  requireAuth,
  verifyCsrfToken,
  body('currentPassword').isLength({ min: 1 }),
  body('newPassword').isLength({ min: 10 }).withMessage('New password must be at least 10 characters.'),
  body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match.'),
  handleValidation((req, res, errors) =>
    res.status(400).render('account/password', {
      title: 'Change password',
      error: errors[0].msg,
      forced: !!req.user.must_change_password,
    })
  ),
  async (req, res) => {
    const ok = await bcrypt.compare(req.body.currentPassword, req.user.password_hash);
    if (!ok) {
      return res.status(400).render('account/password', {
        title: 'Change password',
        error: 'Current password is incorrect.',
        forced: !!req.user.must_change_password,
      });
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    updatePassword.run(hash, req.user.id);
    logAudit({ actorId: req.user.id, action: 'password_changed', entityType: 'user', entityId: req.user.id });
    req.flash('success', 'Password updated.');
    res.redirect('/dashboard');
  }
);

module.exports = router;
