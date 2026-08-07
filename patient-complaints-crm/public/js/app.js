// Confirms destructive form submissions (redact / delete). Kept as a
// plain external script, no inline handlers, so the Content-Security-
// Policy can stay strict (script-src 'self', no 'unsafe-inline').
document.addEventListener('submit', function (event) {
  const form = event.target;
  const message = form.getAttribute('data-confirm');
  if (message && !window.confirm(message)) {
    event.preventDefault();
  }
});

// Auto-submits selects marked .auto-submit (e.g. the role picker in the
// staff admin table), avoiding inline onchange="" handlers so the CSP
// can stay free of 'unsafe-inline' for scripts.
document.addEventListener('change', function (event) {
  if (event.target.matches && event.target.matches('.auto-submit')) {
    event.target.form.submit();
  }
});
