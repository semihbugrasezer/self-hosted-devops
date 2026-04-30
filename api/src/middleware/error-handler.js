const { AppError } = require("../errors/app-error");

function errorHandler(log) {
  return function handleError(error, req, res, next) {
    if (res.headersSent) {
      return next(error);
    }

    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";

    log("error", "request_failed", {
      method: req.method,
      path: req.path,
      statusCode,
      code,
      error: error.message,
    });

    const response = {
      status: "failed",
      code,
      error: error.message,
    };

    if (error instanceof AppError && Object.keys(error.details || {}).length > 0) {
      response.details = error.details;
    }

    return res.status(statusCode).json(response);
  };
}

module.exports = { errorHandler };
