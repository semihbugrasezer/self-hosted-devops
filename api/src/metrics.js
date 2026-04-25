function createMetrics() {
  const counters = {
    requestsTotal: 0,
    deploymentsTotal: 0,
  };

  function recordRequest() {
    counters.requestsTotal += 1;
  }

  function recordDeployment() {
    counters.deploymentsTotal += 1;
  }

  function render() {
    return [
      "# HELP devops_api_requests_total Total HTTP requests handled by the API.",
      "# TYPE devops_api_requests_total counter",
      `devops_api_requests_total ${counters.requestsTotal}`,
      "# HELP devops_deployments_total Total deployment requests accepted by the API.",
      "# TYPE devops_deployments_total counter",
      `devops_deployments_total ${counters.deploymentsTotal}`,
      "# HELP devops_api_uptime_seconds API process uptime.",
      "# TYPE devops_api_uptime_seconds gauge",
      `devops_api_uptime_seconds ${Math.round(process.uptime())}`,
      "",
    ].join("\n");
  }

  return { recordRequest, recordDeployment, render };
}

module.exports = { createMetrics };
