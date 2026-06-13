/**
 * Punto de entrada del backend.
 *  - Sirve la API REST que consume la app.
 *  - Arranca el scheduler que envía los recordatorios vía Evolution API.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { schedulesRouter } from './routes/schedules.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { startScheduler } from './scheduler.js';

const app = express();

// Confiar en el primer proxy (Apache/Nginx del VPS) para que req.ip sea la IP
// real del cliente (X-Forwarded-For) y el rate limit cuente por cliente.
app.set('trust proxy', 1);

app.use(cors());

// Parser JSON tolerante: si el body llega vacío (un POST/DELETE sin cuerpo),
// no intentamos parsearlo — así evitamos el 400 'entity.parse.failed'.
const jsonParser = express.json({ limit: '16kb' });
app.use((req, res, next) => {
  const len = req.headers['content-length'];
  if (!len || len === '0') return next();
  jsonParser(req, res, next);
});

// Healthcheck simple.
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/schedules', schedulesRouter);
app.use('/whatsapp', whatsappRouter);

// Manejador de errores centralizado (Express 5 propaga errores async).
// Nunca devuelve err.message al cliente — puede exponer detalles internos.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] error:', err);
  res.status(500).json({ error: 'Error interno' });
});

// 0.0.0.0 = escucha en todas las interfaces, para que el emulador o un
// teléfono físico (APK) puedan alcanzarlo por la IP LAN del PC.
app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Backend escuchando en el puerto ${config.port}`);
  console.log(`   Local:  http://localhost:${config.port}`);
  console.log(`   Red:    http://<IP-LAN-de-tu-PC>:${config.port}`);
  startScheduler();
});
