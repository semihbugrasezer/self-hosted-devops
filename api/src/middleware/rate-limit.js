const { RateLimitError } = require("../errors/app-error");

function clientKey(req) {
  const forwardedFor = req.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function createDeployRateLimiter(config) {
  const windowMs = config.security.deployRateLimitWindowSeconds * 1000;
  const maxRequests = config.security.deployRateLimitMaxRequests;
  const buckets = new Map();

  return function deployRateLimit(req, res, next) {
    const key = clientKey(req);
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(maxRequests - bucket.count, 0);
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      return next(new RateLimitError());
    }

    return next();
  };
}

module.exports = { createDeployRateLimiter };
