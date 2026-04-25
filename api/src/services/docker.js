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

  async function removeContainer(name, deploymentId) {
    await run("docker", ["rm", "-f", name], { deploymentId }).catch(() => {});
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

  return { dockerLabels, buildImage, removeContainer, runContainer };
}

module.exports = { createDockerService };
