const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3000);

app.get("/", (req, res) => {
  res.json({
    service: "sample-service",
    message: "deployed by the self-hosted DevOps platform",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`sample-service listening on ${port}`);
});
