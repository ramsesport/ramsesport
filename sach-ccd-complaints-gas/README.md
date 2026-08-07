# SACH Corp CCD — Patient Complaints CRM (Google Apps Script edition)

A patient-complaints CRM for the SACH Corp Communications Department that
lives entirely inside your corporate Google Workspace: a Google Sheet as
the database, a Google Apps Script web app as the interface, and Drive as
storage. No server to host or patch, no separate login system — staff
just open a link while signed into their `@sach.org.sg` account.

This is a from-scratch rebuild of the earlier Node.js prototype
(`../patient-complaints-crm/` in this repo) for a different deployment
target: that version needs a real server host; this one deploys entirely
inside Google Drive and is built specifically so a future move to
Microsoft 365 / OneDrive is a clean export, not a data migration project.

**I could not deploy this for you.** This session only had access to a
personal Google account, not a `sach.org.sg` Workspace account — and even
with the right account connected, there's no tool available here that can
create/deploy an Apps Script project remotely. Follow the steps below (or
hand them to IT) to actually stand it up; it takes about 10 minutes.

## What it does

- **Case intake & triage** — patient/complainant details, source,
  category, severity, assignee.
- **Status workflow & SLA tracking** — Open → In Progress → Escalated →
  Resolved → Closed, with an auto-computed SLA due date (Critical 2 days,
  High 5, Medium 10, Low 15) and an overdue flag on the list and dashboard.
- **Communication log** — a timestamped, append-only notes timeline per case.
- **Dashboard** — counts by status/category/severity, overdue count,
  average resolution time, recent activity feed.
- **Reporting**
  - One-click **PDF reports** from any filter combination (date range,
    status, category, severity, assignee), with your choice of columns.
  - **Custom report builder** — save a filter+column combination as a
    named template and re-run it later.
  - **Scheduled email reports** — a weekly PDF automatically emailed to
    whoever you configure, via a time-driven trigger.
- **Staff accounts & roles** — `staff` can log/work cases; `admin` can
  also manage accounts, redact/delete records, view the audit log, and
  configure reporting/backups. No passwords — access is entirely your
  Google Workspace sign-in.
- **Audit log** — every login-gated action (case changes, redactions,
  deletions, report exports, account changes) recorded with who and when.
- **M365 migration export** — a one-click full `.xlsx` snapshot of every
  sheet, saved to a Backups folder in Drive, ready to drop into OneDrive.

## Deployment (≈10 minutes, do this as the `sach.org.sg` account)

1. **Create the Sheet.** Go to Google Drive → New → Google Sheets. Name
   it something like `SACH CCD Patient Complaints — Database`.
2. **Open the script editor.** In the Sheet, go to Extensions → Apps
   Script. This creates a bound Apps Script project — delete the default
   `Code.gs` boilerplate content.
3. **Copy in every file from this folder** (`sach-ccd-complaints-gas/`):
   - Create each `.gs` file (Code, Setup, Complaints, Notes, Admin,
     Dashboard, Reports) via the **+** next to Files → Script, and paste
     the matching content.
   - Create each `.html` file (Index, Stylesheet) via **+** → HTML, and
     paste the matching content.
   - Open **Project Settings** (gear icon) → check "Show appsscript.json
     manifest file in editor" → open `appsscript.json` → replace its
     contents with this folder's `appsscript.json`.
4. **Run the one-time setup.** In the script editor, select
   `runInitialSetup` from the function dropdown (top toolbar) and click
   **Run**. The first time, Google will ask you to authorize the script's
   permissions — review and accept (this is your own script running under
   your own account; nothing here calls out to a third party). This
   creates all the Sheet tabs and makes you the first admin.
   - Optional: also run `seedDemoData` once if you want a few fictional
     example complaints to explore the app with before real data goes in.
5. **Deploy as a web app.** Deploy → New deployment → gear icon → Web
   app. Set:
   - **Execute as:** Me (your account)
   - **Who has access:** Anyone within `sach.org.sg` — this is what
     restricts the app to your organization; it comes from
     `appsscript.json`'s `"access": "DOMAIN"` and should already be
     selected, but double-check it.
   Click Deploy, authorize again if prompted, and copy the **Web app
   URL** — that's the link you share with CCD staff.
6. **Add your team.** Open the web app URL yourself first (you're already
   the first admin) → Admin tab → add each staff member's `@sach.org.sg`
   email with a name and role. That's the entire "account creation"
   process — there's no password to set or send.
7. **(Optional) Turn on the weekly email report.** Admin tab → Reports →
   set recipients → Enable weekly email, pick a day/time.

Whenever you edit any `.gs`/`.html` file later, you must **create a new
deployment version** (Deploy → Manage deployments → edit → New version)
for the live web app URL to pick up the change — editing the files alone
doesn't update what's already deployed.

## PDPA (Singapore) design notes

- **Data minimisation** — the intake form only collects what's needed to
  investigate and respond (name, one contact method, the complaint text).
- **Access control** — two layers: the web app itself only opens for
  signed-in `@sach.org.sg` accounts (Workspace domain restriction), and
  within that, only accounts explicitly added to the Users sheet by an
  admin can use the app at all.
- **Accountability / audit trail** — every case change, note, status
  update, redaction, deletion, report export, and account change is
  logged to the AuditLog sheet with who and when, visible to admins.
- **Correction & erasure rights** — admins can **redact** a case (blanks
  patient name/contact permanently, keeps the case for operational
  reporting) or **permanently delete** it (also removes its notes); the
  audit log keeps a non-identifying trace that a deletion happened.
- **No real data in the demo** — `seedDemoData()` only ever inserts
  clearly fictional `(fictional)`-suffixed names.

### A note for whoever reviews this for IT/security

Google Apps Script has no concept of a "private" function — every
top-level function in the project is directly callable from the browser
via `google.script.run`, regardless of whether the client-side code calls
it. This project is built with that in mind: every function that reads
or writes complaint/user/audit data and is left reachable performs its
own `requireActiveUser()` / `requireAdminUser()` check as its first line,
independent of what the UI does. Generic low-level sheet plumbing (raw
reads/writes, audit-log inserts) is namespaced under `Db`/`Audit`
objects specifically so it is *not* independently reachable — only
object methods internal to the script, not dispatchable top-level
functions. See the comment block at the top of `Code.gs` for the full
explanation, and the comment on `sendScheduledReport()` in `Reports.gs`
for the one function that's a deliberate, low-impact exception (it must
stay top-level to work as a time-trigger target).

## M365 / OneDrive migration (when the time comes)

Two ways to get everything out, either is fine:

1. **One click, in-app:** Admin tab → Reports → "Export Excel snapshot".
   This saves a full `.xlsx` copy of every sheet (Complaints, Notes,
   Users, AuditLog, ReportTemplates, Config) into a "SACH CCD Complaints
   — Backups" folder in Drive, timestamped. Download that file and upload
   it straight into OneDrive or SharePoint — Excel opens Google Sheets'
   `.xlsx` export natively, no conversion needed.
2. **Manual, no code:** open the Sheet directly → File → Download →
   Microsoft Excel (.xlsx). Same result, useful as a one-off without
   touching the app.

Either way, what lands in M365 is a normal Excel workbook — one sheet per
tab, plain rows and columns, no proprietary format to translate. If the
CRM itself needs to keep running after the platform switch, the
Complaints/Notes/etc. tables in that workbook are also a clean starting
point for importing into whatever M365-native tool replaces this (e.g. a
Power Apps + Dataverse or SharePoint list rebuild) — but that's a second,
separate project at that point, not something this export tries to
predict today.

## Troubleshooting

**"Sheet 'X' is missing" error** — `runInitialSetup()` hasn't been run
yet (or was run against a different Sheet than the one bound to this
script). Run it from the Apps Script editor.

**"Your account is not set up in this system yet"** — you're signed into
a valid `@sach.org.sg` account but haven't been added to the Users sheet.
An existing admin needs to add you via the Admin tab (or, for the very
first admin, re-run `runInitialSetup()` — it only adds an admin if the
Users sheet is completely empty, so this is safe to re-run).

**Changes to the code don't show up** — you edited the `.gs`/`.html`
files but didn't create a new deployment version. Deploy → Manage
deployments → pencil icon → Version: New version → Deploy.

**Weekly email report stopped arriving** — the trigger runs with the
Drive/Gmail authority of whichever admin created it (standard Apps
Script behavior). If that person's account was deactivated or their
Workspace permissions changed, the trigger silently stops working. Any
admin can re-arm it: Admin tab → Reports → Enable weekly email again.

**"Exceeded maximum execution time" or quota errors** — Apps Script has
daily quotas (e.g. ~6 min per execution, various daily caps on
UrlFetchApp/MailApp/DriveApp calls) that a CCD team's realistic volume
should never approach. If you do hit one, it almost always means an
unbounded loop or a test script left running — check **Executions** in
the left sidebar of the Apps Script editor for the failing run's logs.

**Need a completely fresh start** — delete all rows below the header in
each sheet tab (never delete the header row or the tab itself), or just
create a brand-new Sheet and repeat the deployment steps.

**Where's the data actually stored?** — entirely in the one Google Sheet
you created in step 1. Anyone who can already see that Sheet in Drive
(per normal Drive sharing) can see the raw data directly, in addition to
through the app — keep the underlying Sheet's sharing settings as tight
as the web app's (i.e., don't share the Sheet file itself beyond admins
who need direct access, since the app already handles staff access via
its own Users tab).
