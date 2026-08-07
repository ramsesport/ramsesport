'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { db, logAudit } = require('../db');
const { verifyCsrfToken } = require('../middleware/csrf');
const { handleValidation } = require('../middleware/validate');

const router = express.Router();

const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');

// Slows down credential-stuffing / brute-force attempts against the
// login form without needing an external service. This counts every
// POST to /login per source IP (successful or not) against one shared
// bucket — if CCD staff sit behind a single office NAT/proxy IP, they
// share that bucket, so the default is generous. Tune via env vars if
// IT wants it stricter or looser without touching code.
const windowMinutes = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES) || 15;
const loginLimiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this network. Please wait a few minutes and try again.',
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Sign in', error: null });
});

router.post(
  '/login',
  loginLimiter,
  verifyCsrfToken,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }),
  handleValidation((req, res) =>
    res.status(400).render('login', { title: 'Sign in', error: 'Please enter a valid email and password.' })
  ),
  async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail.get(email);

    const genericError = 'Invalid email or password.';

    if (!user || !user.active) {
      logAudit({ actorLabel: email, action: 'login_failure', entityType: 'user', details: { reason: !user ? 'no_such_user' : 'inactive' } });
      return res.status(401).render('login', { title: 'Sign in', error: genericError });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      logAudit({ actorId: user.id, action: 'login_failure', entityType: 'user', entityId: user.id, details: { reason: 'bad_password' } });
      return res.status(401).render('login', { title: 'Sign in', error: genericError });
    }

    req.session.userId = user.id;
    logAudit({ actorId: user.id, action: 'login_success', entityType: 'user', entityId: user.id });
    res.redirect('/dashboard');
  }
);

router.post('/logout', verifyCsrfToken, (req, res) => {
  if (req.user) {
    logAudit({ actorId: req.user.id, action: 'logout', entityType: 'user', entityId: req.user.id });
  }
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
