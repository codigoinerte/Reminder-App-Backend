/**
 * Rutas de WhatsApp del usuario autenticado. Operan sobre SU instancia.
 */
import { Router } from 'express';
import * as evolution from '../evolution.js';
import * as repo from '../repository.js';
import * as users from '../usersRepo.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth);

/** Estado de conexión de la instancia del usuario. */
whatsappRouter.get('/status', async (req: AuthedRequest, res) => {
  const phone = req.userPhone!;
  const user = await users.getByPhone(phone);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const state = await evolution.getConnectionState(user.instanceName);
  res.json({
    instanceName: user.instanceName,
    phone: user.phone,
    state,
  });
});

/**
 * Lista los contactos de WhatsApp del usuario (de SU instancia). Solo personas,
 * sin grupos. El número viene en formato internacional listo para enviar.
 */
whatsappRouter.get('/contacts', async (req: AuthedRequest, res) => {
  const user = await users.getByPhone(req.userPhone!);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const state = await evolution.getConnectionState(user.instanceName);
  if (state !== 'open') {
    return res
      .status(409)
      .json({ error: 'WhatsApp no está conectado', state, contacts: [] });
  }

  try {
    const contacts = await evolution.findContacts(user.instanceName);
    res.json({ contacts });
  } catch (err) {
    console.error('[whatsapp/contacts] error:', err);
    res.status(502).json({ error: 'No se pudieron obtener los contactos', contacts: [] });
  }
});

/**
 * Reconecta WhatsApp del usuario autenticado: regenera el pairing code de su
 * instancia. Usado cuando la cuenta existe pero la instancia está 'close'.
 */
whatsappRouter.post('/reconnect', async (req: AuthedRequest, res) => {
  const user = await users.getByPhone(req.userPhone!);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Si la instancia ya está conectada, no hace falta pairing: avisamos 'open'.
  const current = await evolution.getConnectionState(user.instanceName);
  if (current === 'open') {
    return res.json({ pairingCode: null, state: 'open' });
  }

  // Forzamos un cierre de sesión para que Evolution genere un pairing fresco
  // (una instancia a medias suele devolver pairingCode: null).
  await evolution.logout(user.instanceName).catch(() => {});

  const result = await evolution.createInstance(user.instanceName, user.phone);
  // Persistir instanceId/hash si cambiaron al recrear.
  await users
    .upsertInstance({
      phone: user.phone,
      instanceName: user.instanceName,
      instanceId: result.instanceId ?? user.instanceId,
      instanceHash: result.instanceHash ?? user.instanceHash,
    })
    .catch(() => {});

  res.json({ pairingCode: result.pairingCode ?? null, state: result.state });
});

/** Cierra sesión de WhatsApp (sin borrar la cuenta ni los recordatorios). */
whatsappRouter.delete('/logout', async (req: AuthedRequest, res) => {
  const user = await users.getByPhone(req.userPhone!);
  if (user) await evolution.logout(user.instanceName).catch(() => {});
  res.status(204).end();
});

/** Elimina la cuenta: instancia Evolution + recordatorios + fila users. */
whatsappRouter.delete('/account', async (req: AuthedRequest, res) => {
  const phone = req.userPhone!;
  const user = await users.getByPhone(phone);
  if (user) {
    await evolution.deleteInstance(user.instanceName).catch(() => {});
  }
  await repo.deleteAllForUser(phone);
  await users.deleteUser(phone).catch(() => {});
  res.status(204).end();
});
