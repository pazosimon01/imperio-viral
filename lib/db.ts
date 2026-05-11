// Postgres connection via pg + pool. Reemplaza la implementación previa con
// node:sqlite. Multi-tenant: cada query filtra por workspace_id. El workspace
// activo viene de DEFAULT_WORKSPACE_ID en .env hasta que se monte auth.

import { Pool, types, type PoolClient } from "pg";

// BIGINT (int8) en PG se parsea como STRING por default porque los números
// JS no representan int64 completo. Nuestros timestamps son epoch seconds
// (caben holgados en number), así que parseamos como int.
types.setTypeParser(20, (v) => parseInt(v, 10));

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL no está seteado en .env");
    }
    global.__pgPool = new Pool({
      connectionString: url,
      max: 8,
      // Cerrar conexiones idle antes de que Supavisor las descarte por
      // su lado — evita "Connection closed" en la siguiente query.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
    });
    // CRÍTICO: sin este handler, un error en una conexión idle se
    // propaga como "unhandled error" y mata el proceso de Next.
    global.__pgPool.on("error", (err) => {
      console.error("[pg pool error]", err.message);
    });
  }
  return global.__pgPool;
}

export async function query<T extends Record<string, any> = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends Record<string, any> = any>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Workspace activo. Hoy hardcoded desde env; cuando agreguemos auth pasa a
// resolverse del JWT del request.
export function getWorkspaceId(): string {
  const id = process.env.DEFAULT_WORKSPACE_ID;
  if (!id) {
    throw new Error(
      "DEFAULT_WORKSPACE_ID no está seteado en .env. Corré npm run migrate-to-supabase para obtenerlo."
    );
  }
  return id;
}

// Compat: algunas APIs viejas esperaban una función `initSchema`. Como el
// schema ahora vive en supabase/migrations/, este es un no-op preservado
// para no romper imports de scripts/init-db.ts.
export function initSchema(): void {
  // Schema managed by Supabase migrations.
}
