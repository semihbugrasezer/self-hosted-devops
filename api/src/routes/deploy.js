const { requireDeployToken } = require("../middleware/auth");

function createDeployRouter(express, { config, deployService, store }) {
  const router = express.Router();

  router.post("/deploy", requireDeployToken(config), async (req, res, next) => {
    try {
      const deployment = await deployService(req.body);
      res.status(201).json({
        message: "deployment completed",
        deployment,
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
