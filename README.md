# Self-hosted DevOps Platform

A production-like local platform that demonstrates containerized services, reverse proxy routing, dependency-aware readiness checks, automated deployments, rollback handling, and CI/CD integration.

This project is designed as a DevOps / Platform Engineering portfolio project. It favors practical infrastructure patterns a junior engineer should be able to explain in interviews.

## What It Demonstrates

- Node.js API with liveness and readiness checks.
- PostgreSQL and Redis service dependency validation.
- Multi-stage Docker builds.
- Docker Compose orchestration with internal and edge networks.
- Traefik dynamic routing through Docker labels.
- Multiple domains: `api.localhost` and `app.localhost`.
- Deployment API that clones a repository, builds an image, runs a container, and attaches Traefik labels.
- Candidate-container validation before traffic switch.
- Rollback attempt when rollout fails.
- GitHub Actions CI/CD trigger.
- Optional Prometheus and Grafana profile.

## Architecture

```text
GitHub Actions
    |
    | POST /deploy
    v
api.localhost -> Traefik -> DevOps API -> Docker socket
                                |
                                | clone/build/run
                                v
                       Deployed containers

app.localhost -> Traefik -> demo nginx app

internal network: API <-> PostgreSQL, Redis
edge network: Traefik <-> API, app, deployed services
```

## Run Locally

```sh
docker compose up -d --build
```

If ports `80` and `8080` are already used:

```sh
TRAEFIK_HTTP_PORT=8088 TRAEFIK_DASHBOARD_PORT=8089 docker compose up -d --build
```

Check the platform:

```sh
docker compose ps
curl -H "Host: api.localhost" http://127.0.0.1:8088/health
curl -H "Host: api.localhost" http://127.0.0.1:8088/ready
curl -H "Host: app.localhost" http://127.0.0.1:8088/
```

On a clean machine using port `80`, the user-facing URLs are:

```text
http://api.localhost
http://app.localhost
http://localhost:8080
```

## Core API

Liveness:

```sh
curl http://api.localhost/health
```

Readiness:

```sh
curl http://api.localhost/ready
```

Readiness checks both PostgreSQL and Redis. This is important because liveness only answers "is the process up?", while readiness answers "can this service safely receive traffic?".

## Automated Deployment API

`POST /deploy` accepts a Git repository and service metadata:

```sh
curl -X POST http://api.localhost/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "https://github.com/example/node-service.git",
    "name": "orders",
    "domain": "orders.localhost"
  }'
```

For local testing, `repo` can also be a `file://` Git repository URL.

The rollout flow is:

1. Clone the repository into the deployment workspace.
2. Build a Docker image tagged with the deployment ID.
3. Remove any existing container for the same app name.
4. Run the new container on the shared Traefik network.
5. Attach Traefik labels automatically.
6. Store deployment status in PostgreSQL and Redis.
7. Return clear JSON on success or failure.

The platform attaches labels like:

```text
traefik.enable=true
traefik.http.routers.deployed-orders.rule=Host(`orders.localhost`)
traefik.http.routers.deployed-orders.entrypoints=web
traefik.http.services.deployed-orders.loadbalancer.server.port=3000
platform.service=orders
platform.active=true
```

This shows dynamic service discovery without manually editing Traefik config.

## CI/CD

`.github/workflows/ci-cd.yml` runs on push:

- installs Node dependencies
- runs static syntax checks
- builds the API Docker image
- calls the deployment API

Set this GitHub repository variable:

```text
DEPLOY_WEBHOOK_URL=http://your-platform-domain/deploy
```

For a real public deployment endpoint, add authentication and TLS before exposing it.

## Observability

Container logs:

```sh
docker compose logs -f api
docker compose logs -f traefik
```

Optional Prometheus and Grafana:

```sh
docker compose --profile observability up -d --build
```

URLs:

```text
Prometheus: http://localhost:9090
Grafana: http://localhost:3001
```

Grafana defaults to `admin` / `admin`.

## Why These Components

- Docker provides repeatable runtime packaging.
- Docker Compose gives a clear local production simulation with networks, volumes, health checks, and service dependencies.
- Traefik demonstrates platform-style dynamic routing through labels.
- PostgreSQL represents durable deployment metadata.
- Redis represents cache/session infrastructure and readiness dependency handling.
- GitHub Actions proves automation from commit to deployment.
- The deployment API demonstrates how platform teams abstract infrastructure behind a simple developer workflow.

## Production Hardening Ideas

- Add authentication to `/deploy`.
- Restrict allowed Git repository origins.
- Replace raw Docker socket access with a safer deployment worker or Docker socket proxy.
- Add per-deployment logs and streamed build output.
- Add deployment locks per service to avoid concurrent rollouts.
- Use blue/green routing or weighted traffic for true zero-downtime.
- Add image scanning with Trivy.
- Push images to a registry instead of building only on the host.
- Move from Docker Compose to Swarm or Kubernetes for real multi-node scheduling.
- Add Terraform for provisioning the host, DNS, firewall, and monitoring.

## Interview Talking Points

- Difference between `/health` and `/ready`.
- Why Traefik labels allow dynamic routing.
- Why candidate validation prevents broken deploys from receiving traffic.
- What rollback can and cannot guarantee in a single-node Docker setup.
- Why exposing the Docker socket is powerful but dangerous.
- How this project could evolve into Kubernetes, GitOps, or a multi-node platform.
