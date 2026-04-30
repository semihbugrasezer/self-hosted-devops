function createMetrics() {
  const latencyBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
  const counters = {
    requestsTotal: 0,
    deploymentsTotal: 0,
    requestLabels: new Map(),
  };

  function labelKey(method, route, statusCode) {
    return `${method}|${route}|${statusCode}`;
  }

  function labelLine(metric, method, route, statusCode, suffix = "") {
    return `${metric}{method="${method}",route="${route}",status_code="${statusCode}"${suffix}}`;
  }

  function getRequestLabel(method, route, statusCode) {
    const key = labelKey(method, route, statusCode);
    if (!counters.requestLabels.has(key)) {
      counters.requestLabels.set(key, {
        method,
        route,
        statusCode,
        count: 0,
        sum: 0,
        buckets: latencyBuckets.map((le) => ({ le, count: 0 })),
      });
    }

    return counters.requestLabels.get(key);
  }

  function recordRequest({ method, route, statusCode, durationSeconds }) {
    counters.requestsTotal += 1;
    const label = getRequestLabel(method, route, statusCode);
    label.count += 1;
    label.sum += durationSeconds;

    for (const bucket of label.buckets) {
      if (durationSeconds <= bucket.le) {
        bucket.count += 1;
      }
    }
  }

  function recordDeployment() {
    counters.deploymentsTotal += 1;
  }

  function render() {
    const lines = [
      "# HELP devops_api_requests_total Total HTTP requests handled by the API.",
      "# TYPE devops_api_requests_total counter",
      `devops_api_requests_total ${counters.requestsTotal}`,
      "# HELP devops_api_request_duration_seconds API HTTP request duration in seconds.",
      "# TYPE devops_api_request_duration_seconds histogram",
    ];

    for (const label of counters.requestLabels.values()) {
      for (const bucket of label.buckets) {
        lines.push(
          `${labelLine(
            "devops_api_request_duration_seconds_bucket",
            label.method,
            label.route,
            label.statusCode,
            `,le="${bucket.le}"`,
          )} ${bucket.count}`,
        );
      }
      lines.push(
        `${labelLine(
          "devops_api_request_duration_seconds_bucket",
          label.method,
          label.route,
          label.statusCode,
          ',le="+Inf"',
        )} ${label.count}`,
      );
      lines.push(
        `${labelLine(
          "devops_api_request_duration_seconds_sum",
          label.method,
          label.route,
          label.statusCode,
        )} ${label.sum.toFixed(6)}`,
      );
      lines.push(
        `${labelLine(
          "devops_api_request_duration_seconds_count",
          label.method,
          label.route,
          label.statusCode,
        )} ${label.count}`,
      );
    }

    lines.push(
      "# HELP devops_deployments_total Total deployment requests accepted by the API.",
      "# TYPE devops_deployments_total counter",
      `devops_deployments_total ${counters.deploymentsTotal}`,
      "# HELP devops_api_uptime_seconds API process uptime.",
      "# TYPE devops_api_uptime_seconds gauge",
      `devops_api_uptime_seconds ${Math.round(process.uptime())}`,
      "# HELP devops_api_memory_rss_bytes API resident memory usage in bytes.",
      "# TYPE devops_api_memory_rss_bytes gauge",
      `devops_api_memory_rss_bytes ${process.memoryUsage().rss}`,
      "# HELP devops_api_memory_heap_used_bytes API heap memory usage in bytes.",
      "# TYPE devops_api_memory_heap_used_bytes gauge",
      `devops_api_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`,
      "# HELP devops_api_cpu_user_seconds_total API user CPU time in seconds.",
      "# TYPE devops_api_cpu_user_seconds_total counter",
      `devops_api_cpu_user_seconds_total ${(process.cpuUsage().user / 1000000).toFixed(6)}`,
      "# HELP devops_api_cpu_system_seconds_total API system CPU time in seconds.",
      "# TYPE devops_api_cpu_system_seconds_total counter",
      `devops_api_cpu_system_seconds_total ${(process.cpuUsage().system / 1000000).toFixed(6)}`,
      "",
    );

    return lines.join("\n");
  }

  return { recordRequest, recordDeployment, render };
}

module.exports = { createMetrics };
