# Backend — WhatsApp Scheduler

Express + Neon Postgres + scheduler (`node-cron`) que envía los recordatorios
vía Evolution API.

## Requisitos

- Node 18+ (probado con Node 22).
- Una base de datos **Neon Postgres** (gratis en https://neon.tech).
- **Evolution API** accesible (por defecto `http://localhost:8080`).

## Configuración

1. Copia el ejemplo de entorno y complétalo:

   ```bash
   cp .env.example .env
   ```

   | Variable                  | Descripción                                              |
   | ------------------------- | -------------------------------------------------------- |
   | `PORT`                    | Puerto del backend (default `3000`).                     |
   | `DATABASE_URL`            | Connection string de Neon (incluye `?sslmode=require`).  |
   | `EVOLUTION_BASE_URL`      | URL de Evolution API (`http://localhost:8080`).          |
   | `EVOLUTION_API_KEY`       | API key global de Evolution (header `apikey`).           |
   | `EVOLUTION_INSTANCE_NAME` | Nombre de la instancia de WhatsApp.                      |
   | `CRON_EXPRESSION`         | Frecuencia del scheduler (default `* * * * *` = 1 min).  |

2. Instala dependencias y crea las tablas:

   ```bash
   npm install
   npm run migrate
   ```

## Ejecutar

```bash
npm run dev     # desarrollo (recarga en caliente)
npm start       # producción
```

Al arrancar verás `🚀 Backend en http://localhost:3000` y
`[scheduler] activo`.

## API

| Método | Ruta                      | Descripción                                  |
| ------ | ------------------------- | -------------------------------------------- |
| GET    | `/health`                 | Healthcheck.                                 |
| GET    | `/schedules`              | Lista recordatorios.                         |
| POST   | `/schedules`              | Crea un recordatorio.                        |
| PUT    | `/schedules/:id`          | Edita un recordatorio.                       |
| PATCH  | `/schedules/:id/enabled`  | Activa/desactiva (`{ "enabled": bool }`).    |
| DELETE | `/schedules/:id`          | Elimina un recordatorio.                     |
| GET    | `/whatsapp/status`        | Estado de conexión + número.                 |
| POST   | `/whatsapp/connect`       | Crea/recupera instancia (pairing code / QR). |
| DELETE | `/whatsapp/logout`        | Cierra sesión de WhatsApp.                   |
| DELETE | `/whatsapp/account`       | Borra la instancia y todos los recordatorios.|

### Forma de un recordatorio (POST/PUT body)

```json
{
  "title": "Recordar medicina",
  "message": "Hola, recuerda tomar tu medicina.",
  "contactName": "Mamá",
  "contactNumber": "51999999999",
  "scheduleDate": "2026-06-10T13:30:00.000Z",
  "repeatType": "daily",
  "enabled": true
}
```

`repeatType`: `once` | `daily` | `weekly` | `monthly`.

## Cómo funciona el scheduler

Cada minuto (`CRON_EXPRESSION`):

1. Busca recordatorios `enabled = true`, `status = 'scheduled'` y
   `schedule_date <= ahora`.
2. Envía cada uno con `POST /message/sendText/{instance}`.
3. Si es recurrente, reprograma la siguiente ocurrencia; si es `once`, lo marca
   `sent` (o `failed` si el envío falló).

## Modelo de datos

- **`users`**: info de la instancia de Evolution (instance_name/id/hash, phone,
  timezone, theme).
- **`schedules`**: los recordatorios. Ver `src/db/migrate.ts`.
