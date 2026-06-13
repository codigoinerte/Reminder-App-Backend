/**
 * Scheduler multi-usuario: cada minuto busca recordatorios pendientes de TODOS
 * los usuarios y envía cada uno por la instancia de Evolution de su dueño.
 */
import cron from 'node-cron';
import { config, normalizePhone } from './config.js';
import * as repo from './repository.js';
import * as users from './usersRepo.js';
import * as evolution from './evolution.js';
import type { RepeatType, Schedule } from './types.js';

function nextOccurrence(current: string, repeat: RepeatType): string | null {
  if (repeat === 'once') return null;
  const d = new Date(current);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** Desfase máximo (en minutos) que se aplica a la hora de envío en repetitivos. */
const JITTER_MAX_MIN = 5;

/**
 * Elige el texto a enviar. En repetitivos arma un pool con el mensaje base + las
 * variantes y elige uno al azar EVITANDO repetir el índice del último envío
 * (cuando hay alternativas). En 'once' (o sin variantes) devuelve el mensaje
 * fijo. Devuelve el índice elegido para guardarlo y no repetirlo la próxima vez.
 */
function pickMessage(s: Schedule): { text: string; index: number } {
  if (s.repeatType === 'once' || s.messageVariants.length === 0) {
    return { text: s.message, index: 0 };
  }
  const pool = [s.message, ...s.messageVariants];
  const last = s.lastVariantIndex;
  const candidates = pool
    .map((_, i) => i)
    .filter((i) => i !== last || pool.length === 1);
  const index = candidates[Math.floor(Math.random() * candidates.length)];
  return { text: pool[index], index };
}

/**
 * Desfase aleatorio (0..JITTER_MAX_MIN minutos) que se aplicará al PRÓXIMO envío.
 * Solo para repetitivos; 'once' siempre 0 (hora exacta). Va hacia adelante para
 * no adelantar nunca el envío respecto a la hora que eligió el usuario.
 */
function nextJitter(repeat: RepeatType): number {
  if (repeat === 'once') return 0;
  return Math.floor(Math.random() * (JITTER_MAX_MIN + 1));
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

      // Elegimos el texto (variante anti-repetición en repetitivos) ANTES de
      // enviar, para guardar luego qué índice se usó.
      const { text, index: usedVariantIndex } = pickMessage(s);

      if (!instanceName) {
        console.error(`[scheduler] sin instancia para user ${s.userId}, omito "${s.title}"`);
      } else {
        try {
          // Red de seguridad: normalizamos el número aquí también, por si quedó
          // guardado sin código de país (datos antiguos previos a la corrección
          // en la ruta de creación). Sin el 51, Evolution responde exists:false.
          const to = normalizePhone(s.contactNumber);
          await evolution.sendText(instanceName, to, text);
          ok = true;
          console.log(`[scheduler] ✅ "${s.title}" -> ${s.contactNumber} (user ${s.userId})`);
        } catch (err) {
          console.error(`[scheduler] ❌ falló "${s.title}" (user ${s.userId}):`, err);
        }
      }

      const next = ok ? nextOccurrence(s.scheduleDate, s.repeatType) : null;
      await repo.markSent(s.id, {
        nextDate: next,
        ok,
        usedVariantIndex: ok ? usedVariantIndex : s.lastVariantIndex,
        nextJitterMin: nextJitter(s.repeatType),
      });
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
