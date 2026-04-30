const { requireDeployToken } = require("../middleware/auth");
const { createDeployRateLimiter } = require("../middleware/rate-limit");

function createDeployRouter(express, { config, deployService, store }) {
  const router = express.Router();
  const deployRateLimit = createDeployRateLimiter(config);

  router.post("/deploy", deployRateLimit, requireDeployToken(config), async (req, res, next) => {
    try {
      const result = await deployService(req.body);
      res.status(201).json({
        message: "deployment completed",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/deployments/:id", async (req, res, next) => {
    try {
      const result = await store.getDeployment(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "deployment not found" });
      }

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createDeployRouter };
