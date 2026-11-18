const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const badges = await client.query(
    "select code, title, kind, icon from academy_badges where kind='level' order by code",
  );
  console.log('--- Badges de niveau ---');
  console.table(badges.rows);

  const quizzes = await client.query(
    "select code, title, pass_threshold from academy_quizzes order by code",
  );
  console.log('--- Quiz ---');
  console.table(quizzes.rows);

  const courses = await client.query(
    "select code, title, level from academy_courses order by level, position",
  );
  console.log('--- Cours ---');
  console.table(courses.rows);

  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
