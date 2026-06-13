/**
 * Rutas de autenticación. Identidad = número de WhatsApp.
 *
 * Flujo de registro (primera vez):
 *   1. POST /auth/connect { number }      -> crea instancia, devuelve pairing code
 *   2. (usuario vincula en WhatsApp; la app hace polling)
 *   3. GET  /auth/state?number=...        -> { state, registered }
 *   4. POST /auth/register { number, password }  (solo si state=open)  -> { token }
 *
 * Flujo de login (siguientes veces):
 *   POST /auth/login { number, password } -> { token }
 */
import { Router } from 'express';
import * as evolution from '../evolution.js';
import * as users from '../usersRepo.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { instanceNameFor, normalizePhone } from '../config.js';
import { authLimiter, connectLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

function validNumber(n: string): boolean {
  return n.length >= 10 && n.length <= 15;
}

/** Paso 1: crear instancia del usuario y devolver el pairing code. */
authRouter.post('/connect', connectLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.number);
  if (!validNumber(phone)) {
    return res.status(400).json({ error: 'Número inválido' });
  }
  const instanceName = instanceNameFor(phone);
  const result = await evolution.createInstance(instanceName, phone);

  await users
    .upsertInstance({
      phone,
      instanceName,
      instanceId: result.instanceId ?? null,
      instanceHash: result.instanceHash ?? null,
    })
    .catch(() => {});

  res.json({
    pairingCode: result.pairingCode ?? null,
    state: result.state,
  });
});

/**
 * Cancelar la vinculación en curso: borra la instancia temporal en Evolution
 * para que Baileys DEJE de reintentar conectarse de inmediato (en vez de
 * esperar a DEL_TEMP_INSTANCES en el próximo restart).
 *
 * Sin auth a propósito: un usuario nuevo aún no tiene token cuando cancela.
 * Solo borramos si la instancia NO está 'open' (no tumbamos una sesión activa).
 */
authRouter.post('/cancel', connectLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.number);
  if (!validNumber(phone)) {
    return res.status(400).json({ error: 'Número inválido' });
  }
  const instanceName = instanceNameFor(phone);
  const state = await evolution.getConnectionState(instanceName);
  if (state !== 'open') {
    await evolution.deleteInstance(instanceName).catch(() => {});
  }
  res.json({ ok: true });
});

/** Estado de vinculación + si el usuario ya tiene contraseña (registrado). */
authRouter.get('/state', connectLimiter, async (req, res) => {
  const phone = normalizePhone(req.query?.number);
  if (!validNumber(phone)) {
    return res.status(400).json({ error: 'Número inválido' });
  }
  const instanceName = instanceNameFor(phone);
  const state = await evolution.getConnectionState(instanceName);
  const registered = await users.hasPassword(phone).catch(() => false);
  res.json({ state, registered });
});

/** Paso final del registro: fija la contraseña. Requiere instancia 'open'. */
authRouter.post('/register', authLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.number);
  const password = String(req.body?.password ?? '');
  if (!validNumber(phone)) {
    return res.status(400).json({ error: 'Número inválido' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const user = await users.getByPhone(phone);
  if (!user) {
    return res.status(400).json({ error: 'Primero vincula tu WhatsApp' });
  }
  if (user.passwordHash) {
    return res.status(409).json({ error: 'Este número ya está registrado. Inicia sesión.' });
  }

  // Verificamos que la instancia esté realmente conectada antes de registrar:
  // así solo el dueño del WhatsApp puede crear la cuenta.
  const state = await evolution.getConnectionState(user.instanceName);
  if (state !== 'open') {
    return res.status(403).json({ error: 'WhatsApp aún no está vinculado' });
  }

  await users.setPassword(phone, await hashPassword(password));
  res.json({ token: signToken(phone), phone });
});

/** Login con número + contraseña. */
authRouter.post('/login', authLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.number);
  const password = String(req.body?.password ?? '');
  if (!validNumber(phone)) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const user = await users.getByPhone(phone);
  if (!user || !user.passwordHash) {
    return res.status(404).json({ error: 'Cuenta no encontrada. Regístrate primero.' });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  res.json({ token: signToken(phone), phone });
});
