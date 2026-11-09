const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const r = await client.query(
    "select table_name from information_schema.tables where table_schema='public' and table_name like 'academy_%' order by table_name",
  );
  console.log(r.rows.map((x) => x.table_name).join('\n'));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
