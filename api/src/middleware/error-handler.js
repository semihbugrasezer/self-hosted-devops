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

    return res.status(statusCode).json({
      status: "failed",
      code,
      error: error.message,
    });
  };
}

module.exports = { errorHandler };
