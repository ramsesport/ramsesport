'use strict';

const { db } = require('../db');

const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');

// Loads the logged-in user (if any) onto req.user for every request.
// If the account has been deactivated since the session cookie was
// issued, the session is dropped immediately — deactivation takes
// effect on the user's very next request, not on their next login.
function attachUser(req, res, next) {
  res.locals.currentUser = null;
  const userId = req.session && req.session.userId;
  if (!userId) return next();

  const user = getUserById.get(userId);
  if (!user || !user.active) {
    req.session = null;
    return next();
  }

  req.user = user;
  res.locals.currentUser = user;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.must_change_password && !req.path.startsWith('/account/password')) {
    return res.redirect('/account/password');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access denied',
      message: 'This area is restricted to CCD administrators.',
    });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
