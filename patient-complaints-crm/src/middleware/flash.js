'use strict';

// One-time flash messages stored in the session cookie. req.flash(msg)
// queues a message; it's read and cleared on the very next render.
function flash(req, res, next) {
  const queued = (req.session && req.session.flash) || [];
  if (req.session) req.session.flash = [];
  res.locals.flashMessages = queued;

  req.flash = (type, message) => {
    if (!req.session) return;
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };
  next();
}

module.exports = { flash };
