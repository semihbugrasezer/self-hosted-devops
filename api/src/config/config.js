const { ValidationError } = require("../errors/app-error");

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);

  if (!Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a number`);
  }

  return value;
}

function listFromEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig() {
  const config = {
    port: numberFromEnv("PORT", 3000),
    serviceName: process.env.SERVICE_NAME || "devops-api",
    environment: process.env.NODE_ENV || "development",
    auth: {
      deployToken: process.env.DEPLOY_TOKEN || "",
    },
    postgres: {
      host: process.env.POSTGRES_HOST || "postgres",
      port: numberFromEnv("POSTGRES_PORT", 5432),
      user: process.env.POSTGRES_USER || "admin",
      password: process.env.POSTGRES_PASSWORD || "admin",
      database: process.env.POSTGRES_DB || "devopsdb",
    },
    redis: {
      host: process.env.REDIS_HOST || "redis",
      port: numberFromEnv("REDIS_PORT", 6379),
    },
    deploy: {
      workspace: process.env.DEPLOY_WORKSPACE || "/deployments",
      dockerNetwork: process.env.DEPLOY_DOCKER_NETWORK || "self-hosted-devops_edge",
      projectLabel: process.env.DEPLOY_PROJECT_LABEL || "self-hosted-devops",
      defaultContainerPort: numberFromEnv("DEPLOY_DEFAULT_CONTAINER_PORT", 3000),
      healthPath: process.env.DEPLOY_HEALTH_PATH || "/health",
      healthTimeoutSeconds: numberFromEnv("DEPLOY_HEALTH_TIMEOUT_SECONDS", 60),
      imageRegistry: process.env.DEPLOY_IMAGE_REGISTRY || "",
      pushImages: process.env.DEPLOY_PUSH_IMAGES === "true",
      allowedRepoPrefixes: listFromEnv("DEPLOY_ALLOWED_REPO_PREFIXES", [
        "https://github.com/",
        "git@github.com:",
        "file://",
      ]),
    },
  };

  if (config.environment === "production" && !config.auth.deployToken) {
    throw new ValidationError("DEPLOY_TOKEN is required when NODE_ENV=production");
  }

  return config;
}

module.exports = { loadConfig };
