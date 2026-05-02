const { ValidationError } = require("../errors/app-error");

const serviceContainers = {
  api: "self-hosted-devops-api-1",
  traefik: "self-hosted-devops-traefik-1",
  app: "self-hosted-devops-app-1",
  worker: "self-hosted-devops-worker-1",
  postgres: "self-hosted-devops-postgres-1",
  redis: "self-hosted-devops-redis-1",
};

function createLogsRouter(express, { run }) {
  const router = express.Router();

  router.get("/logs", async (req, res, next) => {
    try {
      const service = String(req.query.service || "api").trim().toLowerCase();
      const tail = Math.min(Math.max(Number(req.query.tail) || 120, 10), 500);
      const containerName = serviceContainers[service];

      if (!containerName) {
        throw new ValidationError("service must be one of api, traefik, app, worker, postgres, redis");
      }

      const { stdout, stderr } = await run("docker", ["logs", "--tail", String(tail), containerName]);
      const output = [stdout, stderr].filter(Boolean).join("\n");

      return res.json({
        service,
        container: containerName,
        lines: output.split("\n").filter(Boolean),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createLogsRouter };
