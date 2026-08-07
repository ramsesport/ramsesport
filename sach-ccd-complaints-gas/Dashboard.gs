/**
 * Dashboard aggregates. Everything here reads the Complaints/AuditLog
 * sheets fresh on each call — with the data volumes a CCD team
 * realistically generates (hundreds to low thousands of rows/year),
 * scanning the whole sheet in memory is simpler and fast enough, and
 * avoids maintaining separate summary tables that could drift.
 */

function getDashboardStats() {
  requireActiveUser();
  var c = getConstants();
  var complaints = Db.readSheetAsObjects(SHEET_NAMES.COMPLAINTS);
  var now = Date.now();

  var statusMap = {};
  c.STATUSES.forEach(function (s) { statusMap[s] = 0; });
  var byCategory = {};
  var bySeverity = {};
  var overdue = 0;
  var resolutionDaysSum = 0;
  var resolutionCount = 0;

  complaints.forEach(function (comp) {
    statusMap[comp.Status] = (statusMap[comp.Status] || 0) + 1;
    byCategory[comp.Category] = (byCategory[comp.Category] || 0) + 1;
    bySeverity[comp.Severity] = (bySeverity[comp.Severity] || 0) + 1;

    if (c.OPEN_STATUSES.indexOf(comp.Status) !== -1 && comp.DueAt && new Date(comp.DueAt).getTime() < now) {
      overdue++;
    }
    if (comp.ResolvedAt) {
      var days = (new Date(comp.ResolvedAt) - new Date(comp.CreatedAt)) / 86400000;
      resolutionDaysSum += days;
      resolutionCount++;
    }
  });

  var recentActivity = Db.readSheetAsObjects(SHEET_NAMES.AUDIT_LOG);
  recentActivity.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  recentActivity = recentActivity.slice(0, 15);

  // Attach a reference number to complaint-related audit rows for display.
  var byId = {};
  complaints.forEach(function (comp) { byId[comp.ID] = comp.Reference; });
  recentActivity.forEach(function (a) {
    a.Reference = a.EntityType === 'complaint' ? byId[a.EntityID] : null;
  });

  return {
    total: complaints.length,
    statusMap: statusMap,
    byCategory: Object.keys(byCategory).map(function (k) { return { category: k, n: byCategory[k] }; })
      .sort(function (a, b) { return b.n - a.n; }),
    bySeverity: Object.keys(bySeverity).map(function (k) { return { severity: k, n: bySeverity[k] }; }),
    overdue: overdue,
    avgResolutionDays: resolutionCount ? (resolutionDaysSum / resolutionCount).toFixed(1) : null,
    recentActivity: recentActivity,
  };
}
