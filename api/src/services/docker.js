const http = require("http");
const { DockerBuildError, ContainerRuntimeError } = require("../errors/app-error");

function createDockerService(config, run, log) {
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
      `platform.domain=${domain}`,
      `platform.version=${deploymentId.slice(0, 8)}`,
      "platform.active=true",
      `com.docker.compose.project=${config.deploy.projectLabel}`,
    ];
  }

  async function buildImage(image, sourcePath, deploymentId) {
    try {
      await run("docker", ["build", "-t", image, sourcePath], { deploymentId });
    } catch (error) {
      throw new DockerBuildError("Docker image build failed", {
        image,
        sourcePath,
        stderr: error.stderr,
      });
    }
  }

  async function pushImage(image, deploymentId) {
    try {
      await run("docker", ["push", image], { deploymentId });
    } catch (error) {
      throw new DockerBuildError("Docker image push failed", {
        image,
        stderr: error.stderr,
      });
    }
  }

  async function removeContainer(name, deploymentId) {
    await run("docker", ["rm", "-f", name], { deploymentId }).catch(() => {});
  }

  async function listActiveContainers(serviceName, deploymentId) {
    const { stdout } = await run(
      "docker",
      [
        "ps",
        "-aq",
        "--filter",
        `label=platform.service=${serviceName}`,
        "--filter",
        "label=platform.active=true",
      ],
      { deploymentId },
    );

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async function removeContainers(containerNames, deploymentId) {
    for (const containerName of containerNames) {
      await removeContainer(containerName, deploymentId);
    }
  }

  async function runContainer({ name, image, labels, containerPort, deploymentId }) {
    const args = ["run", "-d", "--name", name, "--network", config.deploy.dockerNetwork];

    for (const label of labels) {
      args.push("--label", label);
    }

    args.push(image);

    try {
      await run("docker", args, { deploymentId });
      log("info", "container_started", { name, image, containerPort, deploymentId });
    } catch (error) {
      throw new ContainerRuntimeError("Container failed to start", {
        name,
        image,
        stderr: error.stderr,
      });
    }
  }

  async function inspectContainerIp(containerName, deploymentId) {
    const { stdout } = await run(
      "docker",
      ["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", containerName],
      { deploymentId },
    );

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

  async function waitForHttpHealth(containerName, containerPort, healthPath, timeoutSeconds, deploymentId) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastError = new Error("health check did not run");

    while (Date.now() < deadline) {
      try {
        const ip = await inspectContainerIp(containerName, deploymentId);
        await requestHealth(ip, containerPort, healthPath);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new ContainerRuntimeError("Container health check failed", {
      containerName,
      healthPath,
      error: lastError.message,
    });
  }

  return {
    dockerLabels,
    buildImage,
    pushImage,
    removeContainer,
    removeContainers,
    listActiveContainers,
    runContainer,
    waitForHttpHealth,
  };
}

module.exports = { createDockerService };
