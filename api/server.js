const express = require("express");
const { Pool } = require("pg");
const { createClient } = require("redis");
require("dotenv").config();

const { loadConfig } = require("./src/config/config");
const { initializeDatabase } = require("./src/db/database");
const { createDeployRouter } = require("./src/routes/deploy");
const { createHealthRouter } = require("./src/routes/health");
const { createCommandRunner } = require("./src/services/command");
const { createDeployService } = require("./src/services/deploy");
const { createDeploymentStore } = require("./src/services/deployment-store");
const { createDockerService } = require("./src/services/docker");
const { createGitService } = require("./src/services/git");
const { errorHandler } = require("./src/middleware/error-handler");
const { createMetrics } = require("./src/metrics");
const { createLogger } = require("./src/utils/logger");

const config = loadConfig();
const log = createLogger(config.serviceName);
const app = express();
const startedAt = new Date();
const metrics = createMetrics();

app.use(express.json());

const db = new Pool(config.postgres);
const redis = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

redis.on("error", (error) => {
  log("error", "redis_error", { error: error.message });
});

function routeName(req) {
  if (req.route && req.route.path) {
    return `${req.baseUrl || ""}${req.route.path}`;
  }

  if (/^\/deployments\/[^/]+$/.test(req.path)) {
    return "/deployments/:id";
  }

  return req.path || "/";
}

app.use((req, res, next) => {
  const started = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - started;
    metrics.recordRequest({
      method: req.method,
      route: routeName(req),
      statusCode: res.statusCode,
      durationSeconds: durationMs / 1000,
    });

    log("info", "request_completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
});

async function withTimeout(name, promise, timeoutMs = 2000) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readiness() {
  const checks = await Promise.allSettled([
    withTimeout("postgres", db.query("SELECT 1")).then(() => "connected"),
    redis.isOpen
      ? withTimeout("redis", redis.ping()).then(() => "connected")
      : Promise.reject(new Error("redis client is not connected")),
  ]);

  const [postgres, redisCheck] = checks;

  return {
    ready: checks.every((check) => check.status === "fulfilled"),
    dependencies: {
      postgres:
        postgres.status === "fulfilled"
          ? { status: postgres.value }
          : { status: "error", error: postgres.reason.message },
      redis:
        redisCheck.status === "fulfilled"
          ? { status: redisCheck.value }
          : { status: "error", error: redisCheck.reason.message },
    },
  };
}

const run = createCommandRunner(log);
const store = createDeploymentStore(db, redis);
const git = createGitService(run);
const docker = createDockerService(config, run, log);
const deploy = createDeployService({ config, store, git, docker, log });

app.use(
  createHealthRouter(express, {
    config,
    startedAt,
    readiness,
    metrics: metrics.render,
  }),
);

app.use(
  createDeployRouter(express, {
    config,
    store,
    deployService: async (payload) => {
      metrics.recordDeployment();
      return deploy.deployService(payload);
    },
  }),
);

app.use(errorHandler(log));

async function connectRedisWithRetry(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!redis.isOpen) {
        await redis.connect();
      }
      await redis.ping();
      return;
    } catch (error) {
      log("warn", "redis_connect_retry", {
        attempt,
        maxAttempts,
        error: error.message,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("redis connection failed");
}

async function start() {
  await connectRedisWithRetry();
  await initializeDatabase(db);

  const server = app.listen(config.port, () => {
    log("info", "server_started", { port: config.port });
  });

  async function shutdown(signal) {
    log("info", "shutdown_started", { signal });
    server.close(async () => {
      await Promise.allSettled([db.end(), redis.quit()]);
      log("info", "shutdown_completed");
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((error) => {
  log("fatal", "startup_failed", { error: error.message });
  process.exit(1);
});
