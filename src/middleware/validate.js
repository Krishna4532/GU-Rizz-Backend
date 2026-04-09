const { validationResult } = require('express-validator');
const { badRequest } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({
      field: e.path,
      message: e.msg,
    })));
  }
  next();
};

module.exports = validate;
