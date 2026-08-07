'use strict';

const { validationResult } = require('express-validator');

// Runs after an express-validator chain. On failure, re-renders the
// same page via the caller-supplied render function with the errors
// attached, instead of ever building SQL from unvalidated input.
function handleValidation(renderOnError) {
  return (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    return renderOnError(req, res, result.array());
  };
}

module.exports = { handleValidation };
