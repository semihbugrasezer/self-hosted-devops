const { UnauthorizedError } = require("../errors/app-error");

function requireDeployToken(config) {
  return function deployAuth(req, res, next) {
    if (!config.auth.deployToken) {
      return next();
    }

    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (token !== config.auth.deployToken) {
      return next(new UnauthorizedError());
    }

    return next();
  };
}

module.exports = { requireDeployToken };
