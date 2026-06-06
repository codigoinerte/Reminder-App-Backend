/**
 * Configuración central del backend. Lee variables del archivo .env.
 */
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`
    );
  }
  return value;
}

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
  jwtSecret: required('JWT_SECRET'),
  // Duración del token de sesión.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',

  // Cada cuánto corre el scheduler (cron). Por defecto cada minuto.
  cronExpression: process.env.CRON_EXPRESSION ?? '* * * * *',
};

/** Construye el nombre de instancia de Evolution para un número dado. */
export function instanceNameFor(phone: string): string {
  return `${config.evolution.instancePrefix}-${phone}`;
}
