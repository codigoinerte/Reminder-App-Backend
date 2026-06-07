/**
 * Scheduler multi-usuario: cada minuto busca recordatorios pendientes de TODOS
 * los usuarios y envía cada uno por la instancia de Evolution de su dueño.
 */
import cron from 'node-cron';
import { config, normalizePhone } from './config.js';
import * as repo from './repository.js';
import * as users from './usersRepo.js';
import * as evolution from './evolution.js';
import type { RepeatType } from './types.js';

function nextOccurrence(current: string, repeat: RepeatType): string | null {
  if (repeat === 'once') return null;
  const d = new Date(current);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

let running = false;

export async function tick(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await repo.findDueSchedules(now);
    if (due.length === 0) return;

    // Cache de instancia por usuario para no consultar users repetidamente.
    const instanceCache = new Map<string, string | null>();
    const instanceFor = async (userId: string): Promise<string | null> => {
      if (instanceCache.has(userId)) return instanceCache.get(userId)!;
      const u = await users.getByPhone(userId).catch(() => null);
      const name = u?.instanceName ?? null;
      instanceCache.set(userId, name);
      return name;
    };

    console.log(`[scheduler] ${due.length} recordatorio(s) por enviar.`);

    for (const s of due) {
      const instanceName = await instanceFor(s.userId);
      let ok = false;

      if (!instanceName) {
        console.error(`[scheduler] sin instancia para user ${s.userId}, omito "${s.title}"`);
      } else {
        try {
          // Red de seguridad: normalizamos el número aquí también, por si quedó
          // guardado sin código de país (datos antiguos previos a la corrección
          // en la ruta de creación). Sin el 51, Evolution responde exists:false.
          const to = normalizePhone(s.contactNumber);
          await evolution.sendText(instanceName, to, s.message);
          ok = true;
          console.log(`[scheduler] ✅ "${s.title}" -> ${s.contactNumber} (user ${s.userId})`);
        } catch (err) {
          console.error(`[scheduler] ❌ falló "${s.title}" (user ${s.userId}):`, err);
        }
      }

      const next = ok ? nextOccurrence(s.scheduleDate, s.repeatType) : null;
      await repo.markSent(s.id, next, ok);
    }
  } catch (err) {
    console.error('[scheduler] error en tick:', err);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (!cron.validate(config.cronExpression)) {
    throw new Error(`CRON_EXPRESSION inválida: ${config.cronExpression}`);
  }
  cron.schedule(config.cronExpression, () => void tick());
  console.log(`[scheduler] activo (cron: "${config.cronExpression}").`);
}
