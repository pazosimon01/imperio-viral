// Autenticación del MVP: usuarios con email+contraseña (bcryptjs, sin node-gyp)
// y sesión en cookie firmada con HMAC-SHA256. El middleware (Edge) verifica la
// firma; aquí (Node) se firma, se hashea y se consulta la DB.

import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";

export const SESSION_COOKIE = "imperio_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Falta SESSION_SECRET en .env");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SessionPayload {
  uid: string;
  exp: number; // unix segundos
}

export function signSession(uid: string): string {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
  };
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(p).digest());
  return `${p}.${sig}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    ) as SessionPayload;
    if (!payload.uid || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  workspaceId: string | null;
}

export async function getSessionUser(): Promise<AppUser | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null; // fuera de request scope (scripts CLI)
  }
  const payload = verifySession(token);
  if (!payload) return null;
  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    workspace_id: string | null;
  }>(
    `SELECT id, email, display_name, role, workspace_id FROM app_users WHERE id = $1`,
    [payload.uid]
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    workspaceId: row.workspace_id,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createUser(opts: {
  email: string;
  password: string;
  displayName: string | null;
}): Promise<AppUser> {
  const email = opts.email.trim().toLowerCase();
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM app_users WHERE email = $1`,
    [email]
  );
  if (existing) throw new Error("Ese correo ya está registrado.");

  // El primer usuario de la instalación es admin.
  const count = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM app_users`
  );
  const role = (count?.n ?? 0) === 0 ? "admin" : "member";
  const wsId = process.env.DEFAULT_WORKSPACE_ID ?? null;
  const hash = await hashPassword(opts.password);

  const rows = await query<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    workspace_id: string | null;
  }>(
    `INSERT INTO app_users (email, password_hash, display_name, role, workspace_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, display_name, role, workspace_id`,
    [email, hash, opts.displayName, role, wsId]
  );
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    workspaceId: r.workspace_id,
  };
}

export async function authenticate(
  email: string,
  password: string
): Promise<AppUser | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
    role: string;
    workspace_id: string | null;
  }>(
    `SELECT id, email, password_hash, display_name, role, workspace_id
     FROM app_users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
  if (!row) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    workspaceId: row.workspace_id,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false, // ngrok termina TLS; localhost es http — el token va firmado igual
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}
