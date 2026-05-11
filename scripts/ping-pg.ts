import "dotenv/config";
import { Client } from "pg";

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await c.query("SELECT 1");
    console.log(`  SELECT 1: ${Date.now() - t0}ms`);
  }
  await c.end();
})();
