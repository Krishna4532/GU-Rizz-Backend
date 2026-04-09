const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created') =>
  res.status(201).json({ success: true, message, data });

const error = (res, message = 'An error occurred', statusCode = 500, errors = null) =>
  res.status(statusCode).json({ success: false, message, ...(errors && { errors }) });

const notFound = (res, message = 'Not found') =>
  res.status(404).json({ success: false, message });

const unauthorized = (res, message = 'Unauthorized') =>
  res.status(401).json({ success: false, message });

const forbidden = (res, message = 'Forbidden') =>
  res.status(403).json({ success: false, message });

const badRequest = (res, message = 'Bad request', errors = null) =>
  res.status(400).json({ success: false, message, ...(errors && { errors }) });

module.exports = { success, created, error, notFound, unauthorized, forbidden, badRequest };
