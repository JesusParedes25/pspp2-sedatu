# PSPP v2.0 — Plataforma de Seguimiento de Proyectos Prioritarios

**SEDATU** | Uso interno | 2026

---

## Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Frontend   │────▶│   Backend   │────▶│   PostgreSQL    │
│  React/Vite │     │  Express.js │     │  + PostGIS      │
│  :5173      │     │  :3000      │     │  :5432          │
└─────────────┘     └──────┬──────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              ┌─────▼─────┐ ┌────▼──────┐
              │   MinIO   │ │ GeoServer │
              │  :9000    │ │  :8080    │
              │  :9001    │ │           │
              └───────────┘ └───────────┘
```

## Requisitos

- Docker Engine 24+ y Docker Compose v2+
- Puertos libres: **5173**, **3000**, **5432**, **9000**, **9001**, **8080**

## Inicio rápido

```bash
git clone [repo] && cd pspp-v2
cp .env.example .env
# Editar .env (cambiar contraseñas)
docker-compose up --build
# Esperar ~30 segundos
docker-compose exec backend npm run seed
# Abrir http://localhost:5173
# Email: jesus.paredes@sedatu.gob.mx | Password: demo2026
```

## Variables de entorno

| Variable           | Descripción                                    | Obligatoria |
|--------------------|------------------------------------------------|:-----------:|
| `DB_NAME`          | Nombre de la base de datos PostgreSQL          | ✅          |
| `DB_USER`          | Usuario de PostgreSQL                          | ✅          |
| `DB_PASSWORD`      | Contraseña de PostgreSQL                       | ✅          |
| `JWT_SECRET`       | Secreto para firmar tokens JWT (mín. 64 chars) | ✅          |
| `JWT_EXPIRES_IN`   | Tiempo de expiración del token (ej: `8h`)      | ✅          |
| `MINIO_USER`       | Usuario administrador de MinIO                 | ✅          |
| `MINIO_PASSWORD`   | Contraseña de MinIO                            | ✅          |
| `MINIO_BUCKET`     | Nombre del bucket para evidencias              | ✅          |
| `GEOSERVER_USER`   | Usuario admin de GeoServer                     | ✅          |
| `GEOSERVER_PASSWORD` | Contraseña de GeoServer                      | ✅          |
| `SMTP_HOST`        | Servidor SMTP para correos                     | ❌          |
| `SMTP_PORT`        | Puerto SMTP (por defecto 587)                  | ❌          |
| `SMTP_USER`        | Usuario SMTP                                   | ❌          |
| `SMTP_PASSWORD`    | Contraseña SMTP                                | ❌          |
| `SMTP_FROM`        | Dirección de remitente                         | ❌          |

## Comandos útiles

```bash
# Logs en tiempo real
docker-compose logs -f backend

# Reiniciar solo un servicio
docker-compose restart backend

# Acceder a PostgreSQL
docker-compose exec postgres psql -U pspp_user -d pspp_db

# Cargar solo DGs y usuarios (sin proyectos de ejemplo)
docker-compose exec backend npm run seed:base

# Limpiar todo y empezar desde cero
docker-compose down -v && docker-compose up --build

# Generar JWT_SECRET seguro
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Despliegue en servidor SEDATU (Rocky Linux)

```bash
# Instalar Docker en Rocky Linux
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli docker-compose-plugin
sudo systemctl enable --now docker

# Subir y descomprimir
scp pspp-v2.zip usuario@servidor:/opt/
cd /opt && unzip pspp-v2.zip && cd pspp-v2

# Configurar producción
cp .env.example .env.production
# Editar .env.production con valores reales

# Levantar
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Datos iniciales
docker compose -f docker-compose.prod.yml exec backend npm run seed:base

# Build frontend
docker compose -f docker-compose.prod.yml exec frontend npm run build
# Copiar dist/ a /var/www/pspp/

# Nginx
sudo cp nginx/nginx.conf /etc/nginx/conf.d/pspp.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Solución de problemas

| Problema                    | Solución                                                       |
|-----------------------------|----------------------------------------------------------------|
| Puerto ocupado              | Verificar con `netstat -tlnp` y detener el servicio conflictivo |
| Postgres no responde        | `docker-compose restart postgres` y esperar healthcheck         |
| MinIO bucket no existe      | Se crea automáticamente en el seed; o crear manualmente en :9001 |
| GeoServer sin capas         | Módulo cartográfico es segunda fase (TODO)                      |
| Token JWT expirado          | Hacer login nuevamente; ajustar `JWT_EXPIRES_IN` en `.env`      |

## Backups (producción)

```bash
# Backup manual (Postgres + MinIO), verifica el dump y rota los viejos
./scripts/backup.sh

# Verificar que un backup restaura de verdad (usa una BD temporal,
# no toca la base de datos real)
./scripts/restore-postgres.sh /opt/pspp-backups/postgres/pspp_<fecha>.dump

# Restaurar de verdad ante un desastre (reemplaza la BD en uso)
./scripts/restore-postgres.sh /opt/pspp-backups/postgres/pspp_<fecha>.dump --force-produccion
```

Programar en cron del servidor (cada 2 días a las 3am). Este comando es
seguro de correr más de una vez — si la línea ya existe la reemplaza en
vez de duplicarla (ajustar la ruta del repo si es distinta a
`/root/pspp2-sedatu`):

```bash
CRON_LINE="0 3 */2 * * /root/pspp2-sedatu/scripts/backup.sh >> /var/log/pspp-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -vF "scripts/backup.sh"; echo "$CRON_LINE") | crontab -
crontab -l   # confirmar que quedó
```

> **Nota sobre "cada 2 días"**: cron no tiene un modo nativo de "cada N
> días desde hoy" — `*/2` en el campo de día del mes corre en los días
> pares del calendario (2, 4, 6... 30). Esto significa que en el cambio
> de mes puede haber un salto de solo 1 día o de 3, en vez de exactos 2.
> Para un backup de respaldo esto es aceptable; si algún día se necesita
> una cadencia exacta habría que resolverlo distinto (systemd timer o
> que el propio script controle la fecha del último backup).

Por defecto los backups se guardan en `/opt/pspp-backups/` (fuera del repo, solo en el servidor) y se conservan **los últimos 2** de cada tipo (Postgres y MinIO) — configurable con `BACKUP_DIR` y `RETENTION_COUNT`. Los backups **viven en el mismo disco que la base de datos real** — si el disco falla, se pierden ambos. En cuanto se pueda, copiar `/opt/pspp-backups/` a otra ubicación (otro servidor, almacenamiento externo) para tener redundancia real; por ahora es mejor que no tener ningún backup.

> **El cron es configuración del sistema operativo, no del repositorio.**
> Este paso se hace **una sola vez por cada servidor** donde corra la
> plataforma — un `git pull` normal no lo vuelve a configurar ni lo
> borra, porque `crontab` vive fuera de la carpeta del proyecto. Solo
> hay que repetirlo si: (a) se despliega en un servidor nuevo (por
> ejemplo, cuando DGTICs lo instale en su propia infraestructura), o
> (b) alguien borra el crontab manualmente. Futuros `git pull` con
> otros cambios de código **no requieren volver a tocar el cron**.

## Seguridad en producción

- Cambiar **TODAS** las contraseñas del `.env.example`
- `JWT_SECRET` mínimo 64 caracteres aleatorios
- Solo Nginx (80/443) expuesto al exterior
- Puertos 5432, 9000, 9001, 8080 solo accesibles internamente
