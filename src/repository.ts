/**
 * Acceso a datos de schedules. Todo aislado por user_id (= número del dueño).
 */
import { sql } from './db/client.js';
import {
  rowToSchedule,
  type Schedule,
  type ScheduleInput,
  type ScheduleRow,
} from './types.js';

function genId(): string {
  return `sch_${crypto.randomUUID()}`;
}

function statusFor(enabled: boolean): Schedule['status'] {
  return enabled ? 'scheduled' : 'disabled';
}

export async function listSchedules(userId: string): Promise<Schedule[]> {
  const rows = (await sql`
    SELECT * FROM schedules WHERE user_id = ${userId} ORDER BY schedule_date ASC
  `) as ScheduleRow[];
  return rows.map(rowToSchedule);
}

/** Obtiene un schedule validando que pertenezca al usuario. */
export async function getSchedule(
  userId: string,
  id: string
): Promise<Schedule | null> {
  const rows = (await sql`
    SELECT * FROM schedules WHERE id = ${id} AND user_id = ${userId}
  `) as ScheduleRow[];
  return rows[0] ? rowToSchedule(rows[0]) : null;
}

/**
 * Las variantes y el jitter SOLO aplican a recordatorios repetitivos. En 'once'
 * se ignoran (variantes vacías, jitter 0) para que el mensaje y la hora sean
 * exactamente los que el usuario fijó.
 */
function variantsFor(input: ScheduleInput): string[] {
  if (input.repeatType === 'once') return [];
  return (input.messageVariants ?? [])
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export async function createSchedule(
  userId: string,
  input: ScheduleInput
): Promise<Schedule> {
  const id = genId();
  const variants = variantsFor(input);
  const rows = (await sql`
    INSERT INTO schedules (
      id, user_id, title, message, contact_name, contact_number,
      schedule_date, repeat_type, enabled, status, message_variants
    ) VALUES (
      ${id}, ${userId}, ${input.title}, ${input.message}, ${input.contactName},
      ${input.contactNumber}, ${input.scheduleDate}, ${input.repeatType},
      ${input.enabled}, ${statusFor(input.enabled)}, ${variants}
    )
    RETURNING *
  `) as ScheduleRow[];
  return rowToSchedule(rows[0]);
}

export async function updateSchedule(
  userId: string,
  id: string,
  input: Partial<ScheduleInput>
): Promise<Schedule | null> {
  const current = await getSchedule(userId, id);
  if (!current) return null;

  const merged = {
    title: input.title ?? current.title,
    message: input.message ?? current.message,
    contactName: input.contactName ?? current.contactName,
    contactNumber: input.contactNumber ?? current.contactNumber,
    scheduleDate: input.scheduleDate ?? current.scheduleDate,
    repeatType: input.repeatType ?? current.repeatType,
    enabled: input.enabled ?? current.enabled,
    // variantes: usa las nuevas si vinieron, si no conserva las actuales;
    // pero si el tipo resultante es 'once' se limpian (no aplican).
    messageVariants:
      input.messageVariants ?? current.messageVariants ?? [],
  };
  const status = merged.enabled ? 'scheduled' : 'disabled';
  const variants =
    merged.repeatType === 'once'
      ? []
      : merged.messageVariants.map((v) => v.trim()).filter((v) => v.length > 0);

  const rows = (await sql`
    UPDATE schedules SET
      title            = ${merged.title},
      message          = ${merged.message},
      contact_name     = ${merged.contactName},
      contact_number   = ${merged.contactNumber},
      schedule_date    = ${merged.scheduleDate},
      repeat_type      = ${merged.repeatType},
      enabled          = ${merged.enabled},
      status           = ${status},
      message_variants = ${variants}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `) as ScheduleRow[];
  return rows[0] ? rowToSchedule(rows[0]) : null;
}

export async function setEnabled(
  userId: string,
  id: string,
  enabled: boolean
): Promise<Schedule | null> {
  const rows = (await sql`
    UPDATE schedules
    SET enabled = ${enabled}, status = ${enabled ? 'scheduled' : 'disabled'}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `) as ScheduleRow[];
  return rows[0] ? rowToSchedule(rows[0]) : null;
}

export async function deleteSchedule(
  userId: string,
  id: string
): Promise<void> {
  await sql`DELETE FROM schedules WHERE id = ${id} AND user_id = ${userId}`;
}

export async function deleteAllForUser(userId: string): Promise<void> {
  await sql`DELETE FROM schedules WHERE user_id = ${userId}`;
}

/**
 * Recordatorios de TODOS los usuarios que ya deben enviarse. Incluye user_id
 * para que el scheduler sepa por qué instancia enviar cada uno.
 */
export async function findDueSchedules(now: Date): Promise<Schedule[]> {
  // Aplicamos el desfase anti-baneo (next_jitter_min) a la hora ancla al
  // comparar: el recordatorio "toca" cuando now >= schedule_date + jitter. La
  // hora base no deriva (el jitter se recalcula tras cada envío). En 'once' el
  // jitter es 0, así que sale a la hora exacta.
  const rows = (await sql`
    SELECT * FROM schedules
    WHERE enabled = true
      AND status = 'scheduled'
      AND schedule_date + make_interval(mins => next_jitter_min) <= ${now.toISOString()}
    ORDER BY schedule_date ASC
  `) as ScheduleRow[];
  return rows.map(rowToSchedule);
}

/**
 * Marca el resultado del envío. Para repetitivos avanza a la próxima fecha
 * ancla y guarda, además, el índice de la variante usada (para no repetirla) y
 * el desfase aleatorio que se aplicará al siguiente envío. Para 'once' solo fija
 * el estado final.
 */
export async function markSent(
  id: string,
  result: {
    nextDate: string | null;
    ok: boolean;
    usedVariantIndex?: number | null;
    nextJitterMin?: number;
  }
): Promise<void> {
  const { nextDate, ok, usedVariantIndex = null, nextJitterMin = 0 } = result;
  if (nextDate) {
    await sql`
      UPDATE schedules
      SET schedule_date = ${nextDate},
          status = 'scheduled',
          last_sent_at = now(),
          last_variant_index = ${usedVariantIndex},
          next_jitter_min = ${nextJitterMin}
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE schedules
      SET status = ${ok ? 'sent' : 'failed'}, last_sent_at = now()
      WHERE id = ${id}
    `;
  }
}
