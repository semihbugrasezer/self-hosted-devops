async function initializeDatabase(db) {
  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await db.query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_name TEXT NOT NULL,
      image TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      repository_url TEXT,
      branch TEXT,
      service_name TEXT,
      container_name TEXT,
      previous_container_name TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS repository_url TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS branch TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS service_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS container_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS previous_container_name TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS error TEXT");
  await db.query("ALTER TABLE deployments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
}

module.exports = { initializeDatabase };
