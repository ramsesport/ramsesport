# SACH Corp CCD — Patient Complaints CRM

A small, self-contained web app for the SACH Corp Communications Department
(CCD) to log, triage, track, and report on patient complaints — modelled on
the core workflow of commercial complaint-management CRMs (Salesforce
Service Cloud, Zendesk, RL Datix), scaled down to what a small internal team
actually needs.

## What it does

- **Case intake & triage** — log a complaint with patient/complainant
  details, source, category, severity, and an owner.
- **Status workflow & SLA tracking** — Open → In Progress → Escalated →
  Resolved → Closed, with an SLA due date set automatically from severity
  (Critical 2 days, High 5, Medium 10, Low 15) and an overdue flag on the
  dashboard and case list.
- **Communication log** — an append-only, timestamped notes timeline on
  every case, so nothing gets lost when a case changes hands.
- **Dashboard & reporting** — counts by status/category/severity, average
  resolution time, overdue count, recent activity feed, and a one-click CSV
  export.
- **Staff accounts & roles** — `staff` can log and work cases; `admin` can
  also manage accounts, redact/delete records, and view the audit log.
- **Audit log** — every login, case change, redaction, deletion, and export
  is recorded with who and when.

## Tech stack (deliberately boring)

Node.js + Express, server-rendered EJS pages, SQLite (via `better-sqlite3`)
as a single database file. No separate database server, no frontend build
step, no framework beyond Express. The goal is that anyone comfortable with
basic web development can read every file in `src/` in an afternoon and fix
whatever breaks — that mattered more here than using the newest tooling.

```
patient-complaints-crm/
├── server.js              # entry point: middleware, routes, error handling
├── src/
│   ├── db.js               # SQLite schema + first-run demo data seed
│   ├── lib/constants.js    # categories, severities, SLA days, statuses
│   ├── middleware/         # auth, CSRF, flash messages, validation
│   ├── routes/             # auth, account, complaints, dashboard, admin
│   └── views/               # EJS templates
├── public/                # static CSS/JS (no external CDNs)
└── data/                  # SQLite file lives here (gitignored)
```

## Running it locally

```bash
cd patient-complaints-crm
npm install
cp .env.example .env
# Edit .env and set SESSION_SECRET to a real random value:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

Open http://localhost:3000. On first run the app creates the SQLite
database, seeds a demo admin + staff account and a handful of fictional
demo complaints, and writes the generated login credentials to
`data/SEED_CREDENTIALS.txt` (also printed to the console). Both seeded
accounts are forced to set a new password on first login. **Delete
`SEED_CREDENTIALS.txt` once you've recorded the credentials somewhere
safe** — it is gitignored so it can never be committed, but it still sits
on disk until you remove it.

To start empty instead of with demo data, set `SEED_DEMO_DATA=false` in
`.env` before the first run (it only ever seeds a brand-new, empty
database — it will never touch or overwrite existing data).

## Deploying it for real use

- Set `NODE_ENV=production` and a strong, unique `SESSION_SECRET` — the app
  refuses to start in production with the default placeholder secret.
- Put it behind HTTPS (a reverse proxy like nginx/Caddy, or your platform's
  TLS termination). Session cookies are marked `Secure` automatically in
  production, so they won't be sent over plain HTTP.
- Back up `data/complaints.db` on whatever schedule your data retention
  policy requires — it's the only stateful file the app has.
- `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MINUTES` in `.env`
  control the login attempt limiter if IT wants it tuned (see "Security
  measures" below for why the default is generous).

## Security measures taken

Built with the expectation that IT/cybersecurity will review it before
staff rely on it day to day:

- **Authentication** — bcrypt-hashed passwords (12 rounds), no accounts
  without a password, session cookies are signed, `httpOnly`, `SameSite=Lax`,
  and `Secure` in production. Sessions expire after 8 hours.
- **Authorization** — every route is gated by a `requireAuth` (and, for
  admin-only areas, `requireAdmin`) middleware; there is no page that skips
  the check by accident because it's applied at the router level, not
  copy-pasted per route.
- **SQL injection** — every query is a parameterized `better-sqlite3`
  prepared statement. User input is never concatenated into SQL.
- **CSRF** — every state-changing form carries a per-session token
  (`src/middleware/csrf.js`) that's verified with a timing-safe comparison
  before the request is processed.
- **Input validation** — all form input is validated server-side with
  `express-validator` (types, lengths, enum membership) before it touches
  the database.
- **Brute-force protection** — login attempts are rate-limited per source
  IP (`express-rate-limit`). The default (30 attempts / 15 minutes) is
  intentionally generous because the bucket is shared by everyone behind
  the same office NAT/proxy IP — tighten it via `.env` if the audit log
  shows real brute-force attempts rather than staff mistyping passwords.
- **Transport/headers** — `helmet` sets a strict Content-Security-Policy
  (no inline scripts or styles, nothing loaded from third-party hosts —
  every asset is served from this app), disables `X-Powered-By`, and sets
  a conservative Referrer-Policy.
- **No secrets in the repo** — `.env` and the SQLite database are
  gitignored; `.env.example` documents every variable without real values.
- **Errors don't leak internals** — the global error handler logs full
  detail server-side but only ever shows the browser a generic message.

## PDPA (Singapore) design choices

This app stores personal data about patients and complainants, so it was
built with Singapore's Personal Data Protection Act in mind:

- **Data minimisation** — the intake form only asks for what's needed to
  investigate and respond to a complaint (name, one contact method, and
  the complaint itself) — no fields exist to collect anything beyond that.
- **Purpose limitation** — the app has exactly one purpose (complaint
  handling) and the login page states that access is logged for that
  purpose.
- **Access control** — only authenticated CCD staff can see any complaint
  data; there is no public or unauthenticated view of any record.
- **Accountability / audit trail** — every login, case creation/edit,
  status change, note, redaction, deletion, and CSV export is written to
  the `audit_log` table with who did it and when, viewable by admins at
  `/admin/audit`. This is the record you'd hand to a PDPA inquiry to show
  who touched what.
- **Correction & withdrawal rights** — admins can **redact** a case
  (`/complaints/:id/redact`), which permanently blanks the patient's name
  and contact details while keeping the case record (category, severity,
  timeline, notes) for operational reporting. For a full erasure request,
  admins can **permanently delete** a case; the audit log keeps a
  non-identifying trace (reference number only) that a deletion happened,
  without retaining the personal data itself.
- **No real data in the demo** — every seeded complaint uses a clearly
  fictional name (`(fictional)` suffix) — never use real patient data to
  test or demo this app.

This is a reasonable starting point, not a compliance sign-off — have
SACH Corp's Data Protection Officer review the retention period for
`data/complaints.db` and the audit log before go-live, and set an actual
data retention/deletion policy (this app does not delete old records
automatically).

## Troubleshooting

**App won't start / crashes immediately**
- Run `npm install` again — a missing or half-installed `node_modules` is
  the most common cause.
- Check `.env` exists (`cp .env.example .env`) and that `NODE_ENV=production`
  isn't set with the placeholder `SESSION_SECRET` — the app deliberately
  refuses to start in that state (see the console output for the reason).
- Check the port isn't already in use: change `PORT` in `.env`.

**"Cannot find module" errors**
- You're probably running `node server.js` from the wrong directory, or
  `node_modules` wasn't installed. Run `npm install` from inside
  `patient-complaints-crm/`.

**Login fails for everyone / "Invalid email or password"**
- Confirm you're using the credentials from `data/SEED_CREDENTIALS.txt`
  (only written once, on first run against a brand-new database).
- If that file is gone and you're locked out, an existing admin can create
  a new account at `/admin/users`. If there is no working admin account at
  all, stop the app, delete `data/complaints.db*`, and restart — this
  re-seeds a fresh demo admin (this also wipes all data, so only do this
  before real complaints have been logged).

**"Too many login attempts"**
- The login rate limiter tripped for that source IP. Wait for the window
  to pass, or check `/admin/audit` for repeated `login_failure` entries
  to see whether it's genuine brute-forcing or just several staff behind
  the same office IP. Tune `LOGIN_RATE_LIMIT_MAX` /
  `LOGIN_RATE_LIMIT_WINDOW_MINUTES` in `.env` if it's a recurring nuisance.

**"Request blocked" / a form submission fails unexpectedly**
- This is the CSRF check — it usually means the session cookie expired
  (8-hour session) or the page was open a long time in another tab.
  Refresh the page and submit again.

**Need to reset everything for a clean demo**
- Stop the app, delete the three files matching `data/complaints.db*`
  (the `.db`, `.db-wal`, `.db-shm` files), and restart — it reseeds fresh
  demo data and prints new credentials.

**Where's the data actually stored?**
- One file: `data/complaints.db` (SQLite). Back it up like any other
  file — no database server to manage.
