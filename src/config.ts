/**
 * Configuración central del backend. Lee variables del archivo .env.
 */
import 'dotenv/config';

const PLACEHOLDER_SECRET = 'cambia_esto_por_un_valor_aleatorio_largo';
const MIN_SECRET_LENGTH = 32;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`
    );
  }
  return value;
}

function requiredSecret(name: string): string {
  const value = required(name);
  if (value === PLACEHOLDER_SECRET || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} es inseguro: debe tener al menos ${MIN_SECRET_LENGTH} caracteres y no puede ser el valor de ejemplo.`
    );
  }
  return value;
}

/** Identificadores del JWT: issuer y audience. */
export const JWT_ISSUER = 'whatsapp-scheduler';
export const JWT_AUDIENCE = 'whatsapp-scheduler-app';

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // Neon Postgres (connection string). Ej:
  // postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
  databaseUrl: required('DATABASE_URL'),

  // Evolution API
  evolution: {
    baseUrl: (process.env.EVOLUTION_BASE_URL ?? 'http://localhost:8080').replace(
      /\/$/,
      ''
    ),
    apiKey: required('EVOLUTION_API_KEY'),
    // PREFIJO de instancia. Cada usuario tiene su instancia:
    // `{prefix}-{numero}`, ej: whatsapp-scheduler-51930299310.
    instancePrefix: process.env.EVOLUTION_INSTANCE_PREFIX ?? 'whatsapp-scheduler',
  },

  // Secreto para firmar los JWT de sesión.
  jwtSecret: requiredSecret('JWT_SECRET'),
  // Duración del token de sesión.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  // Cada cuánto corre el scheduler (cron). Por defecto cada minuto.
  cronExpression: process.env.CRON_EXPRESSION ?? '* * * * *',
};

/** Construye el nombre de instancia de Evolution para un número dado. */
export function instanceNameFor(phone: string): string {
  return `${config.evolution.instancePrefix}-${phone}`;
}

/**
 * Normaliza un número al formato que espera WhatsApp/Evolution: solo dígitos y
 * con código de país. Si llegan 9 dígitos (formato local de Perú), prefija 51.
 *
 * Ej: "+51 930 299 310" -> "51930299310" ; "930299310" -> "51930299310".
 *
 * Se usa tanto para la identidad del usuario (su propio número) como para el
 * número de contacto de cada recordatorio: sin el código de país, Evolution
 * responde `exists:false` y el envío falla.
 */
export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  return digits.length === 9 ? `51${digits}` : digits;
}
