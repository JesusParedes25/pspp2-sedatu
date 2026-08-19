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
| `DB_PORT`          | Puerto interno de PostgreSQL (normalmente `5432`) | ✅       |
| `JWT_SECRET`       | Secreto para firmar tokens JWT (mín. 64 chars) | ✅          |
| `JWT_EXPIRES_IN`   | Tiempo de expiración del token (ej: `8h`)      | ✅          |
| `SUPERADMIN_EMAIL` | Correo de la cuenta de superadministrador      | ✅          |
| `PASSWORD_USER`    | Contraseña de esa cuenta. **Se reaplica en cada arranque** | ✅ |
| `MINIO_USER`       | Usuario administrador de MinIO                 | ✅          |
| `MINIO_PASSWORD`   | Contraseña de MinIO                            | ✅          |
| `MINIO_BUCKET`     | Nombre del bucket para evidencias              | ✅          |
| `MINIO_PORT`       | Puerto interno de MinIO (normalmente `9000`)   | ✅          |
| `FRONTEND_URL`     | URL pública del frontend (links de activación) | ✅          |
| `GEOSERVER_USER`   | Usuario admin de GeoServer (solo desarrollo)   | ✅          |
| `GEOSERVER_PASSWORD` | Contraseña de GeoServer (solo desarrollo)    | ✅          |
| `GEOSERVER_ADMIN_PASSWORD` | Contraseña de GeoServer (solo producción) | ✅       |
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

## Despliegue en producción

Producción corre con `docker-compose.prod.yml`. A diferencia de
desarrollo, **el código se hornea dentro de la imagen al buildear** (no
hay bind-mount), así que cualquier cambio de código —no solo de
configuración— exige reconstruir la imagen correspondiente.

Las variables salen de un archivo de entorno en la raíz del repo.
Compose toma `.env` por defecto; si prefieres `.env.production`, hay que
pasar `--env-file .env.production` en **todos** los comandos de compose y
exportar `ENV_FILE=.env.production` al usar los scripts de backup.
Mantener un solo nombre evita sorpresas.

### Caso A — Actualizar un despliegue que ya está en uso

```bash
cd ~/pspp2-sedatu
git pull

# 1. Migraciones primero, en un contenedor de un solo uso: ajustan el
#    esquema sin tumbar el backend que está atendiendo. Son aditivas e
#    idempotentes; correrlas de más no hace nada.
docker compose -f docker-compose.prod.yml run --rm backend npm run migrate

# 2. Reconstruir lo que cambió (si el cambio toca ambos, los dos)
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml build frontend-build
docker compose -f docker-compose.prod.yml up -d frontend-build

# 3. OBLIGATORIO tras recrear backend (ver la regla de Nginx más abajo)
docker compose -f docker-compose.prod.yml restart nginx
```

`frontend-build` es un contenedor de un solo uso: compila con
`npm run build`, copia `dist/` al volumen `frontend_build` que Nginx
sirve de solo lectura, y termina. No tiene que quedar corriendo.

**Los datos existentes no se tocan.** En producción los seeders están
apagados (no se siembran usuarios de demo ni proyectos de ejemplo), y
los catálogos institucionales solo se siembran la primera vez — ver
"Siembra inicial" abajo.

### Caso B — Instalación nueva, sin datos previos

Para un servidor donde la plataforma arranca de cero (por ejemplo, un
ambiente de pruebas de DGTICs).

```bash
# 1. Requisitos: Docker Engine 24+ y el plugin de Compose v2
#    (usar SIEMPRE `docker compose`, nunca `docker-compose` v1)
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli docker-compose-plugin
sudo systemctl enable --now docker

# 2. Código y configuración
git clone <repo> ~/pspp2-sedatu && cd ~/pspp2-sedatu
cp .env.example .env
# Editar .env con valores reales. Genera el secreto con:
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. Levantar todo
docker compose -f docker-compose.prod.yml up -d --build

# 4. Comprobar el arranque
docker compose -f docker-compose.prod.yml logs backend | tail -30
```

En el primer arranque el backend, por sí solo:

1. corre todas las migraciones y deja el esquema completo;
2. crea el superadministrador con `SUPERADMIN_EMAIL` y `PASSWORD_USER`;
3. siembra los catálogos institucionales —la estructura de SEDATU
   (subsecretarías, unidades responsables, 19 DGs, 11 direcciones de
   área) y los 17 programas presupuestarios del Ramo 15— y anota la
   siembra para no repetirla nunca más.

No hay que correr `npm run seed` ni `seed:base`: **esos seeders son de
desarrollo** y en producción están deshabilitados a propósito, porque
insertan usuarios de demostración con contraseña conocida y proyectos
inventados.

La plataforma queda lista para entrar con el superadministrador, dar de
alta usuarios y crear proyectos. El resto del catálogo se administra
desde el panel (Administración → Catálogos / Programas / Áreas).

### Caso C — Instalación nueva restaurando un respaldo de producción

Para mudar la plataforma a otra infraestructura conservando los datos
reales. **La regla es una: los datos entran antes del primer arranque
del backend.**

```bash
# 1..2. Igual que el Caso B: Docker, clonar el repo y preparar .env
#       (usar el MISMO DB_NAME y DB_USER que el respaldo, o ajustarlos)

# 3. Levantar SOLO la base de datos — todavía no el backend
docker compose -f docker-compose.prod.yml up -d postgres

# 4. Restaurar el respaldo de Postgres
#    (el script pide confirmar el nombre de la BD antes de escribir)
./scripts/restore-postgres.sh /ruta/al/pspp_<fecha>.dump --force-produccion

# 5. Restaurar los archivos de MinIO (evidencias, adjuntos, portadas)
docker compose -f docker-compose.prod.yml up -d minio
docker run --rm --volumes-from pspp-minio \
  -v /ruta/al/respaldo:/backup \
  alpine sh -c "cd / && tar xzf /backup/minio_<fecha>.tar.gz"

# 6. Ahora sí, el resto del stack
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml restart nginx
```

Al arrancar, el backend corre las migraciones (si el respaldo es de una
versión anterior del código, aquí se pone al día el esquema) y encuentra
la marca de siembra que viene dentro del respaldo, así que **no siembra
nada**: el catálogo queda exactamente como estaba en el servidor origen,
incluidas las áreas o programas que el administrador hubiera eliminado.

Verificación después de restaurar:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT clave FROM siembra_inicial;" \
  -c "SELECT count(*) FROM proyectos;" \
  -c "SELECT count(*) FROM direcciones_generales;"

docker compose -f docker-compose.prod.yml logs backend | grep -i "siembra inicial"
```

Los conteos deben coincidir con los del servidor origen, y el log debe
decir *"la administra el panel (siembra inicial ya hecha)"*.

**Lo que el respaldo de Postgres NO se lleva**, y hay que mover aparte:

| Qué | Dónde vive | Cómo se mueve |
|-----|------------|---------------|
| Evidencias y adjuntos | Volumen `minio_prod` | `scripts/backup.sh` lo empaqueta; paso 5 de arriba |
| Capas y estilos de GeoServer | Volumen `geoserver_prod` | Copiar el volumen, o volver a publicar las capas |
| Secretos y configuración | `.env` (no está en el repo) | Copiar a mano |

Ojo con `SUPERADMIN_EMAIL` y `PASSWORD_USER`: en **cada** arranque el
backend reescribe la contraseña de ese correo con lo que diga
`PASSWORD_USER`. Si en el servidor nuevo pones otro valor, cambias esa
contraseña sin darte cuenta. Y si cambias `JWT_SECRET`, todas las
sesiones abiertas se invalidan y la gente vuelve a entrar (molestia
menor, ningún dato se pierde).

### Siembra inicial: por qué los catálogos no se repueblan

Los catálogos institucionales —estructura de SEDATU y programas
presupuestarios del Ramo 15— tienen que existir desde el primer arranque
o una instalación nueva nace inservible: sin DGs no se puede dar de alta
un usuario. Pero solo el **primer** arranque.

Cuando la siembra ocurre queda anotada en la tabla `siembra_inicial`
(una fila por catálogo). Mientras esa marca exista, el arranque no
vuelve a tocar esos catálogos, y **manda el panel de administración**:
lo que ahí se agregue, edite o elimine es definitivo y no reaparece al
reiniciar el backend.

La marca vive dentro de la base de datos, no en el código ni en el
contenedor, así que **viaja con el respaldo**. Por eso el Caso C
funciona sin ningún paso extra. Una base restaurada de una versión
anterior a esta mecánica tampoco corre riesgo: la migración
`055_siembra_inicial.sql` marca como ya sembrado todo catálogo que
tenga contenido, precisamente para no repoblar una base en uso.

## Solución de problemas

| Problema                    | Solución                                                       |
|-----------------------------|----------------------------------------------------------------|
| Puerto ocupado              | Verificar con `netstat -tlnp` y detener el servicio conflictivo |
| Postgres no responde        | `docker-compose restart postgres` y esperar healthcheck         |
| MinIO bucket no existe      | Se crea automáticamente en el seed; o crear manualmente en :9001 |
| GeoServer sin capas         | Módulo cartográfico es segunda fase (TODO)                      |
| Token JWT expirado          | Hacer login nuevamente; ajustar `JWT_EXPIRES_IN` en `.env`      |
| Tras reconstruir el backend, login falla o no cargan proyectos (sin errores en `docker logs pspp-backend`) | Nginx quedó apuntando a la IP interna vieja del contenedor recreado. Reiniciar Nginx: `docker compose -f docker-compose.prod.yml restart nginx` |

⚠️ **Regla importante**: cada vez que se reconstruye `backend` (o `frontend`) con `--build`, Docker le asigna una IP interna nueva al contenedor. Nginx no se entera solo — hay que reiniciarlo también o seguirá intentando hablar con el contenedor viejo (login y toda la API dejan de responder, sin ningún error visible en los logs del backend). Por eso, después de cualquier rebuild:
```bash
docker compose -f docker-compose.prod.yml up --build -d backend   # o frontend/frontend-build
docker compose -f docker-compose.prod.yml restart nginx
```

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
