'use strict';

// Shared enums / lookup data used by routes, views and validators.
// Keeping these in one place means the dropdown options, the SLA clock,
// and the server-side validation can never drift apart.

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

// Days allowed to resolve a complaint, keyed by severity. This is the
// backbone of the SLA / overdue tracking on the dashboard and case list.
const SLA_DAYS = {
  Critical: 2,
  High: 5,
  Medium: 10,
  Low: 15,
};

const CATEGORIES = [
  'Clinical Care',
  'Billing & Charges',
  'Wait Times',
  'Staff Conduct',
  'Facilities & Environment',
  'Communication',
  'Privacy / Data Handling',
  'Other',
];

const SOURCES = ['Phone', 'Email', 'In Person', 'Letter', 'Online Form'];

const STATUSES = ['Open', 'In Progress', 'Escalated', 'Resolved', 'Closed'];

// Statuses that count as "still needs work" for overdue / SLA purposes.
const OPEN_STATUSES = ['Open', 'In Progress', 'Escalated'];

const ROLES = ['staff', 'admin'];

function slaDueDate(createdAt, severity) {
  const days = SLA_DAYS[severity] ?? SLA_DAYS.Medium;
  const due = new Date(createdAt.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due;
}

module.exports = {
  SEVERITIES,
  SLA_DAYS,
  CATEGORIES,
  SOURCES,
  STATUSES,
  OPEN_STATUSES,
  ROLES,
  slaDueDate,
};
