'use strict';

const crypto = require('node:crypto');

// Minimal CSRF protection: a random token is stored in the (signed,
// httpOnly) session cookie and must be echoed back as a hidden form
// field on every state-changing request. No extra dependency, no
// server-side token store — easy for anyone to read and verify.

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function ensureCsrfToken(req, res, next) {
  if (!req.session) req.session = {};
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  const sessionToken = req.session && req.session.csrfToken;
  const bodyToken = req.body && req.body._csrf;
  if (!sessionToken || !bodyToken || !timingSafeEqualStr(sessionToken, bodyToken)) {
    return res.status(403).render('error', {
      title: 'Request blocked',
      message: 'Your session may have expired, or the form was submitted incorrectly. Please go back, refresh the page, and try again.',
    });
  }
  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken };
