/**
 * Cliente de Neon Postgres.
 *
 * Usamos el driver serverless de Neon con su tagged-template `sql` para
 * consultas parametrizadas seguras (evita inyección SQL).
 */
import { neon } from '@neondatabase/serverless';
import { config } from '../config.js';

export const sql = neon(config.databaseUrl);
