'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');

const { attachUser, requireAuth } = require('./src/middleware/auth');
const { ensureCsrfToken } = require('./src/middleware/csrf');
const { flash } = require('./src/middleware/flash');

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-this-to-a-long-random-value')) {
  // eslint-disable-next-line no-console
  console.error('Refusing to start: SESSION_SECRET must be set to a real random value in production. See .env.example.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('trust proxy', 1); // needed for secure cookies / rate limiting behind a reverse proxy

// Strict CSP: no inline scripts/styles, nothing loaded from third-party
// hosts. All assets are served locally from /public.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'same-origin' },
  })
);

app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use(
  cookieSession({
    name: 'ccd_session',
    keys: [process.env.SESSION_SECRET || 'dev-only-secret-change-me', process.env.SESSION_SECRET_OLD].filter(Boolean),
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  })
);

app.use(attachUser);
app.use(flash);
app.use(ensureCsrfToken);

app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: '1d' }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '1d' }));

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

app.use(require('./src/routes/auth'));
app.use(require('./src/routes/account'));
app.use(require('./src/routes/dashboard'));
app.use(require('./src/routes/complaints'));
app.use(require('./src/routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' });
});

// Centralised error handler. Never leaks stack traces to the browser;
// full details go to the server log for whoever is troubleshooting.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred. If this keeps happening, check the server log.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SACH CCD Patient Complaints CRM listening on http://localhost:${PORT}`);
});
