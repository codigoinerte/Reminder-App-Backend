# Despliegue en VPS — WhatsApp Scheduler

Flujo: **código en GitHub** → `git pull` en el VPS → **Docker Compose** levanta
el backend (en `127.0.0.1:7002`) + Evolution (interno) → **Apache** hace de
reverse proxy con HTTPS desde tu subdominio.

```
                               ┌──────────────────── VPS ─────────────────────────┐
  Internet ── 443 ──►         │  Apache (HTTPS / certbot)                          │
   reminderapp.tester.org.pe   │    └─ reverse proxy → 127.0.0.1:7002             │
                               │  ┌─ Docker ─────────────────────────────────────┐ │
                               │  │ backend (127.0.0.1:7002 → :3000) ─► Neon      │ │
                               │  │ backend ─► evolution:8080 (interno)           │ │
                               │  │ evolution ─► evolution_db + evolution_redis   │ │
                               │  └───────────────────────────────────────────────┘ │
                               └────────────────────────────────────────────────────┘
  APK (móvil) ── HTTPS ──► https://reminderapp.tester.org.pe
```

- El backend usa **Neon** (nube) para sus datos (users + schedules).
- **Evolution es interno**: no se expone a internet, solo el backend lo alcanza.
- **Apache** (que ya tienes) es el único que escucha en 80/443. Docker NO usa
  Caddy ni ocupa esos puertos.

---

## 1. Subir el código a GitHub (desde tu PC)

Este repo es **solo el backend** (incluye también los archivos de despliegue:
compose, apache, esta guía). Sube **solo lo necesario** (`node_modules` y `.env`
quedan excluidos por `.gitignore`):

```bash
cd /home/fredy/Desktop/open-projects/reminder-app/backend
git init
git add .
git commit -m "Backend + despliegue Docker/Apache"
# crea el repo en GitHub (privado recomendado) y luego:
git remote add origin git@github.com:TU_USUARIO/reminderapp-backend.git
git push -u origin main
```

> Verifica que el `.env` NO se subió: `git ls-files | grep .env` debe mostrar
> solo `.env.example` y `.env.deploy.example`, nunca un `.env` real.

---

## 2. En el VPS: instalar Docker (si falta) y clonar

```bash
ssh usuario@IP_VPS

# Docker (si no lo tienes)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # luego cierra y reabre sesión
docker compose version

# Clonar el repo
cd ~
git clone git@github.com:TU_USUARIO/reminderapp-backend.git
cd reminderapp-backend
```

---

## 3. Configurar los secretos (`.env`)

```bash
cp .env.deploy.example .env
nano .env
```

Genera los secretos y pégalos:
```bash
openssl rand -hex 32   # → EVOLUTION_API_KEY
openssl rand -hex 24   # → EVOLUTION_DB_PASSWORD
openssl rand -hex 48   # → JWT_SECRET
```
Completa también `DATABASE_URL` (Neon). No hay dominios en este `.env`: el
subdominio vive en la config de Apache (paso 6).

---

## 4. Levantar Docker

```bash
docker compose up -d --build
docker compose ps                 # backend + evolution + db + redis "running"
docker compose logs -f backend
```

El backend queda escuchando en `127.0.0.1:7002` (solo localhost del VPS).
Verifica localmente, sin pasar aún por Apache:
```bash
curl http://127.0.0.1:7002/health   # → {"ok":true}
```

---

## 5. Migrar la base de datos (una sola vez)

```bash
docker compose run --rm backend npm run migrate
```

---

## 6. Configurar Apache como reverse proxy + HTTPS

El subdominio `reminderapp.tester.org.pe` ya apunta al VPS. Configura Apache:

```bash
# Módulos de proxy
sudo a2enmod proxy proxy_http headers

# Copia el VirtualHost de ejemplo y ajusta el ServerName a tu subdominio
sudo cp ~/reminderapp-backend/apache-backend.conf.example \
        /etc/apache2/sites-available/reminderapp.conf
sudo nano /etc/apache2/sites-available/reminderapp.conf   # reminderapp.tester.org.pe

sudo a2ensite reminderapp.conf
sudo systemctl reload apache2

# Emitir el certificado HTTPS (certbot añade el VirtualHost :443 y el ProxyPass)
sudo certbot --apache -d reminderapp.tester.org.pe
```

> Tras certbot, asegúrate de que las directivas `ProxyPass`/`ProxyPassReverse`
> queden dentro del VirtualHost `:443`. Certbot suele copiarlas; si no, muévelas
> al archivo `*-le-ssl.conf` que genera.

---

## 7. Verificar de punta a punta

```bash
curl https://reminderapp.tester.org.pe/health      # → {"ok":true}
```

Esa es la URL del backend lista para el APK.

---

## 8. Actualizar tras cambios de código

```bash
# en tu PC
git add . && git commit -m "cambios" && git push

# en el VPS
cd ~/reminderapp-backend
git pull
docker compose up -d --build backend
```

---

## 9. Operación

```bash
docker compose logs -f backend       # logs del backend
docker compose restart backend       # reiniciar
docker compose down                  # parar (los datos persisten en volúmenes)
```

Backups: volúmenes `evolution_pgdata` y `evolution_instances` (sesiones de
WhatsApp). Neon tiene sus propios backups.

---

## 10. Generar el APK release (apuntando a producción)

Cuando `https://reminderapp.tester.org.pe/health` responda OK:

1. En **`app/.env`** apunta a producción:
   ```env
   EXPO_PUBLIC_API_BASE_URL=https://reminderapp.tester.org.pe
   EXPO_PUBLIC_USE_MOCK=false
   ```
2. Como es HTTPS, ya **no hace falta** `usesCleartextTraffic` (puedes quitar el
   plugin `expo-build-properties` del `app.json`; dejarlo no rompe nada).
3. Build release con Gradle (el método de firma lo configuramos en ese momento):
   ```bash
   cd app
   npx expo prebuild --clean
   cd android
   export JAVA_HOME=/usr/local/android-studio/jbr
   ./gradlew :app:assembleRelease   # requiere keystore propio
   ```

---

## Notas

- Evolution fijado en `atendai/evolution-api:v2.1.1`. Si cambias versión, revisa
  sus variables de entorno.
- El backend corre con `tsx` (sin paso de build), igual que en desarrollo.
- Mantén `EVOLUTION_API_KEY` estable: si la cambias con instancias ya creadas,
  habrá que revincular.
- Acceso interno a Evolution para depurar (no se expone a internet):
  `docker compose exec backend wget -qO- --header "apikey: $EVOLUTION_API_KEY" http://evolution:8080/instance/fetchInstances`
