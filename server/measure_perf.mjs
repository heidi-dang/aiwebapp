import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function measure() {
  const db = await open({
    filename: 'server/aiwebapp.db',
    driver: sqlite3.Database
  });

  console.log('--- Query Plan for getRuns ---');
  const plan = await db.all('EXPLAIN QUERY PLAN SELECT created_at, run_input, content_json FROM runs WHERE session_id = "test" ORDER BY created_at ASC, id ASC');
  console.log(JSON.stringify(plan, null, 2));

  await db.close();
}

measure().catch(console.error);
