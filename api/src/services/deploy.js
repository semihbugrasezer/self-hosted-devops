const crypto = require("crypto");
const path = require("path");
const { ValidationError } = require("../errors/app-error");

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
    throw new ValidationError(`${field} must contain 1-48 URL-safe characters`);
  }

  return slug;
}

function requireDomain(value) {
  const domain = String(value || "").trim().toLowerCase();

  if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain)) {
    throw new ValidationError("domain must be a valid hostname, for example myapp.localhost");
  }

  return domain;
}

function requireRepo(value, allowedPrefixes) {
  const repo = String(value || "").trim();

  if (!/^(https:\/\/|http:\/\/|git@|file:\/\/)/.test(repo)) {
    throw new ValidationError("repo must be an HTTPS, SSH, or file:// Git repository URL");
  }

  if (!allowedPrefixes.some((prefix) => repo.startsWith(prefix))) {
    throw new ValidationError("repo is not allowed by DEPLOY_ALLOWED_REPO_PREFIXES");
  }

  return repo;
}

function createDeployService({ config, store, git, docker, log }) {
  function imageName(serviceName, shortId) {
    const localName = `self-hosted-devops/${serviceName}:${shortId}`;
    if (!config.deploy.imageRegistry) {
      return localName;
    }

    return `${config.deploy.imageRegistry.replace(/\/$/, "")}/${serviceName}:${shortId}`;
  }

  async function deployService(payload) {
    const repositoryUrl = requireRepo(
      payload.repo || payload.repositoryUrl,
      config.deploy.allowedRepoPrefixes,
    );
    const serviceName = requireSlug(payload.name || payload.serviceName, "name");
    const domain = requireDomain(payload.domain || `${serviceName}.localhost`);
    const branch = payload.branch || null;
    const containerPort = Number(payload.containerPort || config.deploy.defaultContainerPort);

    const deploymentId = crypto.randomUUID();
    const shortId = deploymentId.slice(0, 8);
    const sourcePath = path.join(config.deploy.workspace, serviceName, shortId);
    const image = imageName(serviceName, shortId);
    const candidateName = `candidate-${serviceName}-${shortId}`;
    const containerName = `deployed-${serviceName}-${shortId}`;
    const legacyContainerName = `deployed-${serviceName}`;

    const deployment = await store.insertDeployment({
      serviceName,
      image,
      domain,
      repositoryUrl,
      branch,
      status: "queued",
    });

    log("info", "deployment_started", { deploymentId: deployment.id, serviceName, domain });

    try {
      await store.updateDeployment(deployment.id, { status: "cloning" });
      await git.cloneRepository(repositoryUrl, branch, sourcePath, deployment.id);

      await store.updateDeployment(deployment.id, { status: "building" });
      await docker.buildImage(image, sourcePath, deployment.id);

      if (config.deploy.pushImages) {
        await store.updateDeployment(deployment.id, { status: "pushing" });
        await docker.pushImage(image, deployment.id);
      }

      await store.updateDeployment(deployment.id, { status: "validating" });
      await docker.removeContainer(candidateName, deployment.id);
      await docker.runContainer({
        name: candidateName,
        image,
        containerPort,
        deploymentId: deployment.id,
        labels: [
          "traefik.enable=false",
          `platform.service=${serviceName}`,
          `platform.deployment=${deployment.id}`,
          "platform.candidate=true",
        ],
      });
      await docker.waitForHttpHealth(
        candidateName,
        containerPort,
        payload.healthPath || config.deploy.healthPath,
        config.deploy.healthTimeoutSeconds,
        deployment.id,
      );

      const previousContainers = await docker.listActiveContainers(serviceName, deployment.id);

      await store.updateDeployment(deployment.id, {
        status: "switching",
        previousContainerName: previousContainers.join(","),
      });

      await docker.runContainer({
        name: containerName,
        image,
        containerPort,
        deploymentId: deployment.id,
        labels: docker.dockerLabels(serviceName, domain, containerPort, deployment.id),
      });
      await docker.waitForHttpHealth(
        containerName,
        containerPort,
        payload.healthPath || config.deploy.healthPath,
        config.deploy.healthTimeoutSeconds,
        deployment.id,
      );

      await docker.removeContainer(candidateName, deployment.id);
      await docker.removeContainers(previousContainers, deployment.id);
      await docker.removeContainer(legacyContainerName, deployment.id);

      const completed = await store.updateDeployment(deployment.id, {
        status: "running",
        containerName,
      });

      log("info", "deployment_completed", { deploymentId: deployment.id, serviceName });
      return completed;
    } catch (error) {
      log("error", "deployment_failed", {
        deploymentId: deployment.id,
        serviceName,
        code: error.code,
        error: error.message,
      });

      await docker.removeContainer(candidateName, deployment.id);
      await docker.removeContainer(containerName, deployment.id);
      await store.updateDeployment(deployment.id, {
        status: "failed",
        error: error.message,
      });

      throw error;
    }
  }

  return { deployService };
}

module.exports = { createDeployService };
