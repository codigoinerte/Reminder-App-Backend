/**
 * Limitadores de tasa (rate limiting) en memoria.
 *
 * Protegen los endpoints sensibles de auth contra fuerza bruta y abuso:
 *  - `authLimiter`: login/registro (fuerza bruta de contraseñas).
 *  - `connectLimiter`: connect/cancel/state (crean/borran instancias de
 *    Evolution → caros; y /state permite enumerar números).
 *
 * Store en memoria (suficiente para un solo contenedor backend). Si se escala a
 * varias instancias habría que mover el store a Redis. El conteo es por IP, así
 * que el backend DEBE tener `trust proxy` activo detrás del reverse proxy del VPS
 * (ver index.ts) para que `req.ip` sea la IP real del cliente y no la del proxy.
 */
import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

/** Login y registro: pocos intentos por ventana (anti fuerza bruta). */
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta más tarde' },
});

/**
 * Connect/cancel/state: cupo algo más holgado porque la app hace polling de
 * /state mientras el usuario vincula WhatsApp, pero acotado para frenar la
 * creación masiva de instancias y la enumeración de números.
 */
export const connectLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta más tarde' },
});
