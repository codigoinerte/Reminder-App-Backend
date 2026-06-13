/**
 * Rutas CRUD de recordatorios. Protegidas: cada usuario solo ve/edita los
 * suyos (aislados por req.userPhone vía requireAuth).
 */
import { Router } from 'express';
import * as repo from '../repository.js';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { normalizePhone } from '../config.js';
import type { ScheduleInput } from '../types.js';

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

const REPEATS = ['once', 'daily', 'weekly', 'monthly'];

function validate(body: any, partial = false): string | null {
  if (!partial && (!body.title || typeof body.title !== 'string'))
    return 'title es obligatorio';
  if (!partial && (!body.message || typeof body.message !== 'string'))
    return 'message es obligatorio';
  if (!partial && (!body.contactNumber || typeof body.contactNumber !== 'string'))
    return 'contactNumber es obligatorio';
  if (!partial && !body.scheduleDate) return 'scheduleDate es obligatorio';
  if (body.scheduleDate && isNaN(Date.parse(body.scheduleDate)))
    return 'scheduleDate debe ser una fecha ISO válida';
  if (body.repeatType && !REPEATS.includes(body.repeatType))
    return 'repeatType inválido';
  return null;
}

function toInput(body: any): ScheduleInput {
  return {
    title: String(body.title).trim(),
    message: String(body.message).trim(),
    contactName: String(body.contactName ?? '').trim(),
    // Normaliza a formato internacional (51 + 9 dígitos en Perú). Sin el código
    // de país Evolution responde exists:false y el envío falla.
    contactNumber: normalizePhone(body.contactNumber),
    scheduleDate: new Date(body.scheduleDate).toISOString(),
    repeatType: body.repeatType ?? 'once',
    enabled: body.enabled ?? true,
    // Variantes opcionales (el repo las ignora si repeatType === 'once').
    messageVariants: Array.isArray(body.messageVariants)
      ? body.messageVariants.map((v: unknown) => String(v))
      : undefined,
  };
}

schedulesRouter.get('/', async (req: AuthedRequest, res) => {
  res.json(await repo.listSchedules(req.userPhone!));
});

schedulesRouter.post('/', async (req: AuthedRequest, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });
  const created = await repo.createSchedule(req.userPhone!, toInput(req.body));
  res.status(201).json(created);
});

schedulesRouter.put('/:id', async (req: AuthedRequest, res) => {
  const error = validate(req.body, true);
  if (error) return res.status(400).json({ error });
  // Normaliza el número también al editar (mismo motivo que al crear).
  const patch = { ...req.body };
  if (patch.contactNumber != null) {
    patch.contactNumber = normalizePhone(patch.contactNumber);
  }
  const updated = await repo.updateSchedule(req.userPhone!, String(req.params.id), patch);
  if (!updated) return res.status(404).json({ error: 'No encontrado' });
  res.json(updated);
});

schedulesRouter.patch('/:id/enabled', async (req: AuthedRequest, res) => {
  if (typeof req.body.enabled !== 'boolean')
    return res.status(400).json({ error: 'enabled debe ser boolean' });
  const updated = await repo.setEnabled(req.userPhone!, String(req.params.id), req.body.enabled);
  if (!updated) return res.status(404).json({ error: 'No encontrado' });
  res.json(updated);
});

schedulesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await repo.deleteSchedule(req.userPhone!, String(req.params.id));
  res.status(204).end();
});
