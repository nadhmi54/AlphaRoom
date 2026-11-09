const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20261109000000_academy_quiz_attempts.sql'),
    'utf8',
  );
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  console.log('Migration 20261109000000_academy_quiz_attempts.sql appliquee.');
  const r = await client.query(
    "select table_name from information_schema.tables where table_schema='public' and table_name='academy_quiz_attempts'",
  );
  console.log('Table presente :', r.rows.length > 0);
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
