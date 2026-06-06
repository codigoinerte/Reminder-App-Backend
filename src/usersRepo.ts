/**
 * Acceso a la tabla `users`. Una fila por NÚMERO de WhatsApp (la identidad).
 */
import { sql } from './db/client.js';

export type UserRecord = {
  id: string; // = phone
  phone: string;
  instanceName: string;
  instanceId: string | null;
  instanceHash: string | null;
  passwordHash: string | null;
  timezone: string | null;
  theme: string | null;
};

type UserRow = {
  id: string;
  phone: string;
  instance_name: string;
  instance_id: string | null;
  instance_hash: string | null;
  password_hash: string | null;
  timezone: string | null;
  theme: string | null;
};

function rowToUser(r: UserRow): UserRecord {
  return {
    id: r.id,
    phone: r.phone,
    instanceName: r.instance_name,
    instanceId: r.instance_id,
    instanceHash: r.instance_hash,
    passwordHash: r.password_hash,
    timezone: r.timezone,
    theme: r.theme,
  };
}

export async function getByPhone(phone: string): Promise<UserRecord | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${phone}`) as UserRow[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

/**
 * Crea/actualiza la instancia del usuario tras pedir el pairing code.
 * No toca la contraseña (eso es paso aparte).
 */
export async function upsertInstance(data: {
  phone: string;
  instanceName: string;
  instanceId?: string | null;
  instanceHash?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO users (id, phone, instance_name, instance_id, instance_hash)
    VALUES (${data.phone}, ${data.phone}, ${data.instanceName},
            ${data.instanceId ?? null}, ${data.instanceHash ?? null})
    ON CONFLICT (id) DO UPDATE SET
      instance_name = EXCLUDED.instance_name,
      instance_id   = COALESCE(EXCLUDED.instance_id, users.instance_id),
      instance_hash = COALESCE(EXCLUDED.instance_hash, users.instance_hash)
  `;
}

export async function setPassword(
  phone: string,
  passwordHash: string
): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${phone}`;
}

export async function hasPassword(phone: string): Promise<boolean> {
  const u = await getByPhone(phone);
  return !!u?.passwordHash;
}

export async function deleteUser(phone: string): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${phone}`;
}

/** Todos los usuarios (para el scheduler multi-usuario). */
export async function listAll(): Promise<UserRecord[]> {
  const rows = (await sql`SELECT * FROM users`) as UserRow[];
  return rows.map(rowToUser);
}
