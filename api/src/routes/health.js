function createHealthRouter(express, { config, startedAt, readiness, metrics }) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({
      service: config.serviceName,
      environment: config.environment,
        routes: ["/health", "/ready", "/system/status", "/metrics", "/deploy", "/deployments", "/logs"],
    });
  });

  router.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      service: config.serviceName,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: startedAt.toISOString(),
    });
  });

  router.get("/ready", async (req, res, next) => {
    try {
      const state = await readiness();
      res.status(state.ready ? 200 : 503).json({
        status: state.ready ? "ready" : "not_ready",
        ...state,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/system/status", async (req, res, next) => {
    try {
      const state = await readiness();
      res.status(state.ready ? 200 : 503).json({
        service: config.serviceName,
        environment: config.environment,
        status: state.ready ? "operational" : "degraded",
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: startedAt.toISOString(),
        dependencies: state.dependencies,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/metrics", (req, res) => {
    res.type("text/plain").send(metrics());
  });

  return router;
}

module.exports = { createHealthRouter };
