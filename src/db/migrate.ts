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
      message_variants    TEXT[] NOT NULL DEFAULT '{}',
      last_variant_index  INTEGER,
      next_jitter_min     INTEGER NOT NULL DEFAULT 0,
      last_sent_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  // Para BD que ya tenía schedules sin user_id.
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';`;

  // --- Anti-baneo (solo aplica a recordatorios repetitivos) ---
  // message_variants: textos alternativos; junto con `message` forman el pool
  //   del que el scheduler elige uno al azar en cada envío para no repetir
  //   siempre el mismo texto (huella de bot).
  // last_variant_index: índice del pool usado en el último envío, para evitar
  //   repetir la misma variante dos veces seguidas.
  // next_jitter_min: desfase en minutos (p. ej. -7..+10) que se suma a la hora
  //   ancla SOLO al decidir si ya toca enviar. La hora base (schedule_date) no
  //   deriva: el jitter se recalcula tras cada envío y nunca se acumula.
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS message_variants TEXT[] NOT NULL DEFAULT '{}';`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_variant_index INTEGER;`;
  await sql`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS next_jitter_min INTEGER NOT NULL DEFAULT 0;`;

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
