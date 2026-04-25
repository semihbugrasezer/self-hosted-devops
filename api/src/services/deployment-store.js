function mapDeployment(row) {
  return {
    id: row.id,
    appName: row.appName,
    image: row.image,
    domain: row.domain,
    status: row.status,
    repositoryUrl: row.repositoryUrl,
    branch: row.branch,
    serviceName: row.serviceName,
    containerName: row.containerName,
    previousContainerName: row.previousContainerName,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function returningClause() {
  return `
    RETURNING
      id,
      app_name AS "appName",
      image,
      domain,
      status,
      repository_url AS "repositoryUrl",
      branch,
      service_name AS "serviceName",
      container_name AS "containerName",
      previous_container_name AS "previousContainerName",
      error,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
}

function createDeploymentStore(db, redis) {
  async function cacheDeployment(deployment) {
    await redis.set(`deployment:${deployment.id}`, JSON.stringify(deployment), { EX: 3600 });
  }

  async function insertDeployment({
    serviceName,
    image,
    domain,
    repositoryUrl,
    branch,
    status,
  }) {
    const result = await db.query(
      `
        INSERT INTO deployments (
          app_name, image, domain, status, repository_url, branch, service_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ${returningClause()}
      `,
      [serviceName, image, domain, status, repositoryUrl, branch, serviceName],
    );

    const deployment = mapDeployment(result.rows[0]);
    await cacheDeployment(deployment);
    return deployment;
  }

  async function updateDeployment(id, fields) {
    const allowed = {
      status: "status",
      image: "image",
      containerName: "container_name",
      previousContainerName: "previous_container_name",
      error: "error",
    };

    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return null;
    }

    const assignments = entries.map(([key], index) => `${allowed[key]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);

    const result = await db.query(
      `
        UPDATE deployments
        SET ${assignments.join(", ")}, updated_at = now()
        WHERE id = $1
        ${returningClause()}
      `,
      [id, ...values],
    );

    if (!result.rows[0]) {
      return null;
    }

    const deployment = mapDeployment(result.rows[0]);
    await cacheDeployment(deployment);
    return deployment;
  }

  async function getDeployment(id) {
    const cached = await redis.get(`deployment:${id}`);
    if (cached) {
      return { source: "redis", deployment: JSON.parse(cached) };
    }

    const result = await db.query(
      `
        SELECT
          id,
          app_name AS "appName",
          image,
          domain,
          status,
          repository_url AS "repositoryUrl",
          branch,
          service_name AS "serviceName",
          container_name AS "containerName",
          previous_container_name AS "previousContainerName",
          error,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM deployments
        WHERE id = $1
      `,
      [id],
    );

    if (!result.rows[0]) {
      return null;
    }

    return { source: "postgres", deployment: mapDeployment(result.rows[0]) };
  }

  return { insertDeployment, updateDeployment, getDeployment };
}

module.exports = { createDeploymentStore };
