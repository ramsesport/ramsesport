/**
 * Admin-only functions: staff accounts and the audit log. There is no
 * password to manage — accounts here just map a Workspace email address
 * to a name/role/active flag. Signing in is entirely handled by Google
 * (the web app is domain-restricted), so "creating an account" here
 * just means "granting that Workspace user access to this app".
 *
 * Every function here is client-reachable (see the note atop Code.gs)
 * and starts with requireAdminUser().
 */

function listUsers() {
  requireAdminUser();
  return Db.readSheetAsObjects(SHEET_NAMES.USERS);
}

function addUser(email, name, role) {
  requireAdminUser();
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (!name) throw new Error('Name is required.');
  if (['staff', 'admin'].indexOf(role) === -1) throw new Error('Invalid role.');

  var users = Db.readSheetAsObjects(SHEET_NAMES.USERS);
  if (users.some(function (u) { return String(u.Email).toLowerCase() === email; })) {
    throw new Error('That email is already registered.');
  }

  Db.getSheet(SHEET_NAMES.USERS).appendRow([email, name, role, true, new Date()]);
  Audit.log('user_created', 'user', email, { role: role });
  return listUsers();
}

function setUserActive(email, active) {
  var me = requireAdminUser();
  if (String(me.Email).toLowerCase() === String(email).toLowerCase()) {
    throw new Error('You cannot deactivate your own account.');
  }
  var users = Db.readSheetAsObjects(SHEET_NAMES.USERS);
  var target = users.filter(function (u) { return String(u.Email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (!target) throw new Error('No such user.');
  Db.updateRowFromObject(SHEET_NAMES.USERS, USERS_HEADERS, target._row, { Active: !!active });
  Audit.log(active ? 'user_activated' : 'user_deactivated', 'user', email, null);
  return listUsers();
}

function setUserRole(email, role) {
  var me = requireAdminUser();
  if (String(me.Email).toLowerCase() === String(email).toLowerCase()) {
    throw new Error('You cannot change your own role.');
  }
  if (['staff', 'admin'].indexOf(role) === -1) throw new Error('Invalid role.');
  var users = Db.readSheetAsObjects(SHEET_NAMES.USERS);
  var target = users.filter(function (u) { return String(u.Email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (!target) throw new Error('No such user.');
  Db.updateRowFromObject(SHEET_NAMES.USERS, USERS_HEADERS, target._row, { Role: role });
  Audit.log('user_role_changed', 'user', email, { to: role });
  return listUsers();
}

function getAuditLog() {
  requireAdminUser();
  var rows = Db.readSheetAsObjects(SHEET_NAMES.AUDIT_LOG);
  rows.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  return rows.slice(0, 300);
}
