import { useEffect, useMemo, useState } from "react";

const links = [
  { label: "Grafana", href: "http://localhost:3001" },
  { label: "Prometheus", href: "http://localhost:9090" },
  { label: "Loki", href: "http://localhost:3100" },
  { label: "Traefik", href: "http://localhost:8080/dashboard/" },
];

const logServices = ["api", "traefik", "app", "worker", "postgres", "redis"];

function statusTone(status) {
  if (["ok", "ready", "operational", "running", "connected"].includes(status)) {
    return "success";
  }

  if (["failed", "error", "not_ready", "degraded"].includes(status)) {
    return "danger";
  }

  return "warning";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function imageTag(image) {
  if (!image || !image.includes(":")) {
    return image || "-";
  }

  return image.split(":").pop();
}

function StatusPill({ value }) {
  return <span className={`pill ${statusTone(value)}`}>{value || "unknown"}</span>;
}

function Card({ title, value, detail, tone = "success" }) {
  return (
    <section className="metric-card">
      <div className="metric-heading">
        <span>{title}</span>
        <span className={`dot ${tone}`} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

async function getJson(path) {
  const response = await fetch(`/api/platform${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response.json();
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [ready, setReady] = useState(null);
  const [system, setSystem] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [logs, setLogs] = useState({ service: "api", lines: [] });
  const [logService, setLogService] = useState("api");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function refresh() {
    try {
      setError("");
      const [healthData, readyData, systemData, deploymentData, logData] = await Promise.all([
        getJson("/health"),
        getJson("/ready"),
        getJson("/system/status"),
        getJson("/deployments"),
        getJson(`/logs?service=${logService}&tail=120`),
      ]);

      const nextDeployments = deploymentData.deployments || [];
      const nextId = selectedId || nextDeployments[0]?.id;

      setHealth(healthData);
      setReady(readyData);
      setSystem(systemData);
      setDeployments(nextDeployments);
      setLogs(logData);
      setLastUpdated(new Date());

      if (nextId) {
        const detailData = await getJson(`/deployments/${nextId}`);
        setSelectedId(nextId);
        setDetail(detailData);
      } else {
        setDetail(null);
      }
    } catch (fetchError) {
      setError(fetchError.message);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [logService, selectedId]);

  async function selectDeployment(id) {
    setSelectedId(id);
    setDetail(await getJson(`/deployments/${id}`));
  }

  const selectedDeployment = detail?.deployment;
  const runningCount = useMemo(
    () => deployments.filter((deployment) => deployment.status === "running").length,
    [deployments],
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">SD</span>
          <div>
            <strong>DevOps Platform</strong>
            <small>Self-hosted mini PaaS</small>
          </div>
        </div>
        <nav>
          <a href="#overview">Overview</a>
          <a href="#deployments">Deployments</a>
          <a href="#timeline">Timeline</a>
          <a href="#logs">Logs</a>
          <a href="#tools">Tools</a>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Production-like local platform</p>
            <h1>Deployment Control Plane</h1>
          </div>
          <button type="button" onClick={refresh}>Refresh</button>
        </header>

        {error ? <div className="alert">Dashboard API error: {error}</div> : null}

        <section id="overview" className="grid metrics">
          <Card
            title="API Liveness"
            value={health?.status || "unknown"}
            detail={`Uptime ${health?.uptimeSeconds ?? "-"}s`}
            tone={statusTone(health?.status)}
          />
          <Card
            title="Readiness"
            value={ready?.status || "unknown"}
            detail={`Postgres ${ready?.dependencies?.postgres?.status || "-"} / Redis ${ready?.dependencies?.redis?.status || "-"}`}
            tone={statusTone(ready?.status)}
          />
          <Card
            title="Deployments"
            value={`${runningCount}/${deployments.length}`}
            detail="Running deployments"
            tone={runningCount === deployments.length ? "success" : "warning"}
          />
          <Card
            title="System"
            value={system?.status || "unknown"}
            detail={lastUpdated ? `Updated ${formatDate(lastUpdated)}` : "Waiting for data"}
            tone={statusTone(system?.status)}
          />
        </section>

        <section className="panel split" id="deployments">
          <div>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Release history</p>
                <h2>Deployments</h2>
              </div>
              <span>{deployments.length} records</span>
            </div>
            <div className="deployment-list">
              {deployments.map((deployment) => (
                <button
                  type="button"
                  className={`deployment-row ${selectedId === deployment.id ? "active" : ""}`}
                  key={deployment.id}
                  onClick={() => selectDeployment(deployment.id)}
                >
                  <span>
                    <strong>{deployment.serviceName || deployment.appName}</strong>
                    <small>{deployment.domain}</small>
                  </span>
                  <StatusPill value={deployment.status} />
                </button>
              ))}
              {deployments.length === 0 ? <p className="empty">No deployments recorded yet.</p> : null}
            </div>
          </div>

          <div className="detail">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Active release</p>
                <h2>{selectedDeployment?.serviceName || "No deployment selected"}</h2>
              </div>
              {selectedDeployment ? <StatusPill value={selectedDeployment.status} /> : null}
            </div>
            <dl className="facts">
              <div><dt>Repository</dt><dd>{selectedDeployment?.repositoryUrl || "-"}</dd></div>
              <div><dt>Domain</dt><dd>{selectedDeployment?.domain || "-"}</dd></div>
              <div><dt>Image Tag</dt><dd>{imageTag(selectedDeployment?.image)}</dd></div>
              <div><dt>Image</dt><dd>{selectedDeployment?.image || "-"}</dd></div>
              <div><dt>Active Container</dt><dd>{selectedDeployment?.containerName || "-"}</dd></div>
              <div><dt>Updated</dt><dd>{formatDate(selectedDeployment?.updatedAt)}</dd></div>
            </dl>
          </div>
        </section>

        <section className="panel" id="timeline">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h2>Deployment Timeline</h2>
            </div>
          </div>
          <div className="timeline">
            {(detail?.events || []).map((event) => (
              <div className="timeline-item" key={event.id}>
                <span className={`timeline-marker ${statusTone(event.level === "error" ? "failed" : "running")}`} />
                <div>
                  <strong>{event.step}</strong>
                  <p>{event.message}</p>
                  <small>{formatDate(event.createdAt)}</small>
                </div>
              </div>
            ))}
            {!detail?.events?.length ? <p className="empty">Select a deployment to view events.</p> : null}
          </div>
        </section>

        <section className="panel" id="logs">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Runtime output</p>
              <h2>Logs</h2>
            </div>
            <select value={logService} onChange={(event) => setLogService(event.target.value)}>
              {logServices.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>
          <pre className="terminal">
            {(logs.lines || []).join("\n") || "No logs available."}
          </pre>
        </section>

        <section className="panel" id="tools">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Observability</p>
              <h2>Quick Links</h2>
            </div>
          </div>
          <div className="quick-links">
            {links.map((link) => (
              <a href={link.href} key={link.href} target="_blank" rel="noreferrer">
                <strong>{link.label}</strong>
                <span>{link.href}</span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
