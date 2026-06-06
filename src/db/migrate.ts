/**
 * Migración multi-usuario. Idempotente: se puede correr varias veces.
 *
 * Modelo:
 *  - users: una fila por NÚMERO de WhatsApp (la identidad). Guarda la instancia
 *    de Evolution (whatsapp-scheduler-{numero}) y el hash de la contraseña.
 *  - schedules: cada recordatorio pertenece a un user_id (= número del dueño).
 */
import { sql } from './client.js';

async function migrate() {
  // --- users ---
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,          -- el número, ej: 51930299310
      phone         TEXT NOT NULL,
      instance_name TEXT NOT NULL,
      instance_id   TEXT,
      instance_hash TEXT,
      password_hash TEXT,
      timezone      TEXT,
      theme         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Si la tabla users venía del modelo viejo (singleton), aseguramos columnas.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS instance_name TEXT;`;

  // Limpiamos la fila singleton del modelo anterior si existe (no aplica al
  // nuevo esquema y no tiene número/contraseña).
  await sql`DELETE FROM users WHERE id = 'local-user';`;

  // --- schedules ---
  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL DEFAULT '',
      title          TEXT NOT NULL,
      message        TEXT NOT NULL,
      contact_name   TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      schedule_date  TIMESTAMPTZ NOT NULL,
      repeat_type    TEXT NOT NULL DEFAULT 'once',
      enabled        BOOLEAN NOT NULL DEFAULT true,
      status         TEXT NOT NULL DEFAULT 'scheduled',
      last_sent_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  // Para BD que ya tenía schedules sin user_id.
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';`;

  // Índices: el scheduler busca por (enabled, status, fecha) entre TODOS los
  // usuarios; la app lista por user_id.
  await sql`CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules (enabled, status, schedule_date);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules (user_id);`;

  console.log('✅ Migración multi-usuario completada.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
  });
