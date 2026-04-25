const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Pool } = require("pg");
const { createClient } = require("redis");
require("dotenv").config();

const app = express();
app.use(express.json());
const execFileAsync = promisify(execFile);

const config = {
  port: Number(process.env.PORT || 3000),
  serviceName: process.env.SERVICE_NAME || "devops-api",
  environment: process.env.NODE_ENV || "development",
  postgres: {
    host: process.env.POSTGRES_HOST || "postgres",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "admin",
    password: process.env.POSTGRES_PASSWORD || "admin",
    database: process.env.POSTGRES_DB || "devopsdb",
  },
  redis: {
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT || 6379),
  },
  deploy: {
    workspace: process.env.DEPLOY_WORKSPACE || "/deployments",
    dockerNetwork: process.env.DEPLOY_DOCKER_NETWORK || "self-hosted-devops_edge",
    projectLabel: process.env.DEPLOY_PROJECT_LABEL || "self-hosted-devops",
    defaultContainerPort: Number(process.env.DEPLOY_DEFAULT_CONTAINER_PORT || 3000),
    healthTimeoutSeconds: Number(process.env.DEPLOY_HEALTH_TIMEOUT_SECONDS || 60),
  },
};

const startedAt = new Date();

const db = new Pool(config.postgres);
const redis = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

function log(level, message, fields = {}) {
  console.log(
    JSON.stringify({
      level,
      message,
      service: config.serviceName,
      time: new Date().toISOString(),
      ...fields,
    }),
  );
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireSlug(value, field) {
  const slug = toSlug(value);

  if (!slug || slug.length > 48) {
    throw new Error(`${field} must contain 1-48 URL-safe characters`);
  }

  return slug;
}

function requireDomain(value) {
  const domain = String(value || "").trim().toLowerCase();

  if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain)) {
    throw new Error("domain must be a valid hostname, for example myapp.localhost");
  }

  return domain;
}

function requireRepo(value) {
  const repo = String(value || "").trim();

  if (!/^(https:\/\/|http:\/\/|git@|file:\/\/)/.test(repo)) {
    throw new Error("repo must be an HTTPS, SSH, or file:// Git repository URL");
  }

  return repo;
}

async function run(command, args, options = {}) {
  log("info", "command_started", { command, args });
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024 * 20,
      ...options,
    });
    return result;
  } catch (error) {
    error.message = `${command} ${args.join(" ")} failed: ${error.message}`;
    throw error;
  }
}

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    log("info", "request_completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
    });
  });
  next();
});

redis.on("error", (error) => {
  log("error", "redis_error", { error: error.message });
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

async function checkPostgres() {
  await withTimeout("postgres", db.query("SELECT 1"));
  return "connected";
}

async function checkRedis() {
  if (!redis.isOpen) {
    throw new Error("redis client is not connected");
  }

  await withTimeout("redis", redis.ping());
  return "connected";
}

async function readiness() {
  const checks = await Promise.allSettled([checkPostgres(), checkRedis()]);
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

async function initializeDatabase() {
  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await db.query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_name TEXT NOT NULL,
      image TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      repository_url TEXT,
      branch TEXT,
      service_name TEXT,
      container_name TEXT,
      previous_container_name TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS repository_url TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS branch TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS service_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS container_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS previous_container_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS error TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
}

app.get("/", (req, res) => {
  res.json({
    service: config.serviceName,
    environment: config.environment,
    routes: ["/health", "/ready", "/deploy", "/deployments"],
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: config.serviceName,
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: startedAt.toISOString(),
  });
});

app.get("/ready", async (req, res) => {
  const state = await readiness();
  res.status(state.ready ? 200 : 503).json({
    status: state.ready ? "ready" : "not_ready",
    ...state,
  });
});

app.post("/deployments", async (req, res) => {
  const { appName, image, domain } = req.body;

  if (!appName || !image || !domain) {
    return res.status(400).json({
      error: "appName, image, and domain are required",
    });
  }

  const result = await db.query(
    `
      INSERT INTO deployments (app_name, image, domain, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, app_name AS "appName", image, domain, status, created_at AS "createdAt"
    `,
    [appName, image, domain, "queued"],
  );

  await redis.set(`deployment:${result.rows[0].id}`, JSON.stringify(result.rows[0]), {
    EX: 3600,
  });

  log("info", "deployment_queued", result.rows[0]);

  return res.status(202).json({
    message: "deployment queued",
    deployment: result.rows[0],
  });
});

async function insertDeployment({
  serviceName,
  image,
  domain,
  repositoryUrl,
  branch,
  status,
}) {
  const result = await db.query(
    `
      INSERT INTO deployments (
        app_name, image, domain, status, repository_url, branch, service_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        app_name AS "appName",
        image,
        domain,
        status,
        repository_url AS "repositoryUrl",
        branch,
        service_name AS "serviceName",
        container_name AS "containerName",
        previous_container_name AS "previousContainerName",
        error,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [serviceName, image, domain, status, repositoryUrl, branch, serviceName],
  );

  return result.rows[0];
}

async function updateDeployment(id, fields) {
  const allowed = {
    status: "status",
    image: "image",
    containerName: "container_name",
    previousContainerName: "previous_container_name",
    error: "error",
  };

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  const assignments = entries.map(([key], index) => `${allowed[key]} = $${index + 2}`);
  const values = entries.map(([, value]) => value);

  const result = await db.query(
    `
      UPDATE deployments
      SET ${assignments.join(", ")}, updated_at = now()
      WHERE id = $1
      RETURNING
        id,
        app_name AS "appName",
        image,
        domain,
        status,
        repository_url AS "repositoryUrl",
        branch,
        service_name AS "serviceName",
        container_name AS "containerName",
        previous_container_name AS "previousContainerName",
        error,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [id, ...values],
  );

  if (result.rows[0]) {
    await redis.set(`deployment:${id}`, JSON.stringify(result.rows[0]), { EX: 3600 });
  }

  return result.rows[0];
}

function dockerLabels(name, domain, containerPort, deploymentId) {
  const route = `deployed-${name}`;

  return [
    "traefik.enable=true",
    `traefik.docker.network=${config.deploy.dockerNetwork}`,
    `traefik.http.routers.${route}.rule=Host(\`${domain}\`)`,
    `traefik.http.routers.${route}.entrypoints=web`,
    `traefik.http.services.${route}.loadbalancer.server.port=${containerPort}`,
    `platform.service=${name}`,
    `platform.deployment=${deploymentId}`,
    "platform.active=true",
    `com.docker.compose.project=${config.deploy.projectLabel}`,
  ];
}

async function listActiveContainers(serviceName) {
  const { stdout } = await run("docker", [
    "ps",
    "-q",
    "--filter",
    `label=platform.service=${serviceName}`,
    "--filter",
    "label=platform.active=true",
  ]);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function inspectContainerIp(containerName) {
  const { stdout } = await run("docker", [
    "inspect",
    "-f",
    `{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}`,
    containerName,
  ]);

  return stdout.trim();
}

function requestHealth(host, port, healthPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host,
        port,
        path: healthPath,
        timeout: 2000,
      },
      (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 400) {
          resolve();
          return;
        }

        reject(new Error(`health check returned ${response.statusCode}`));
      },
    );

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("health check timed out"));
    });
  });
}

async function waitForHttpHealth(containerName, containerPort, healthPath, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastError = new Error("health check did not run");

  while (Date.now() < deadline) {
    try {
      const ip = await inspectContainerIp(containerName);
      await requestHealth(ip, containerPort, healthPath);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError;
}

async function cloneRepository(repositoryUrl, branch, targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const args = ["clone", "--depth", "1"];
  if (branch) {
    args.push("--branch", branch);
  }
  args.push(repositoryUrl, targetPath);

  await run("git", args);
}

async function runContainer({ name, image, labels, containerPort }) {
  const args = ["run", "-d", "--name", name, "--network", config.deploy.dockerNetwork];

  for (const label of labels) {
    args.push("--label", label);
  }

  args.push(image);

  await run("docker", args);
  log("info", "container_started", { name, image, containerPort });
}

async function deployService(payload) {
  const repositoryUrl = requireRepo(payload.repo || payload.repositoryUrl);
  const serviceName = requireSlug(payload.name || payload.serviceName, "name");
  const domain = requireDomain(payload.domain || `${serviceName}.localhost`);
  const branch = payload.branch || null;
  const containerPort = Number(payload.containerPort || config.deploy.defaultContainerPort);

  const deploymentId = crypto.randomUUID();
  const shortId = deploymentId.slice(0, 8);
  const serviceRoot = path.join(config.deploy.workspace, serviceName);
  const sourcePath = path.join(serviceRoot, shortId);
  const image = `self-hosted-devops/${serviceName}:${shortId}`;
  const containerName = `deployed-${serviceName}`;

  const deployment = await insertDeployment({
    serviceName,
    image,
    domain,
    repositoryUrl,
    branch,
    status: "queued",
  });

  await updateDeployment(deployment.id, { status: "cloning" });

  try {
    await cloneRepository(repositoryUrl, branch, sourcePath);

    await updateDeployment(deployment.id, { status: "building" });
    await run("docker", ["build", "-t", image, sourcePath]);

    await updateDeployment(deployment.id, { status: "replacing" });
    await updateDeployment(deployment.id, {
      previousContainerName: containerName,
    });

    await run("docker", ["rm", "-f", containerName]).catch(() => {});

    await runContainer({
      name: containerName,
      image,
      containerPort,
      labels: dockerLabels(serviceName, domain, containerPort, deployment.id),
    });

    const completed = await updateDeployment(deployment.id, {
      status: "running",
      containerName,
    });

    return completed;
  } catch (error) {
    log("error", "deployment_failed", {
      deploymentId: deployment.id,
      serviceName,
      error: error.message,
    });

    await Promise.allSettled([
      run("docker", ["rm", "-f", containerName]),
    ]);

    await updateDeployment(deployment.id, {
      status: "failed",
      error: error.message,
    });

    throw error;
  }
}

app.post("/deploy", async (req, res) => {
  try {
    const deployment = await deployService(req.body);
    return res.status(201).json({
      message: "deployment completed",
      deployment,
    });
  } catch (error) {
    const statusCode = /must|required|valid/.test(error.message) ? 400 : 500;

    return res.status(statusCode).json({
      status: "failed",
      error: error.message,
    });
  }
});

app.get("/deployments/:id", async (req, res) => {
  const cached = await redis.get(`deployment:${req.params.id}`);
  if (cached) {
    return res.json({ source: "redis", deployment: JSON.parse(cached) });
  }

  const result = await db.query(
    `
      SELECT id, app_name AS "appName", image, domain, status, created_at AS "createdAt"
      FROM deployments
      WHERE id = $1
    `,
    [req.params.id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "deployment not found" });
  }

  return res.json({ source: "postgres", deployment: result.rows[0] });
});

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
  await initializeDatabase();

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
