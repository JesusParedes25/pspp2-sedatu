# PSPP v2.0 — Despliegue nativo (sin Docker), Rocky Linux 9

Guía paso a paso para instalar PSPP v2.0 directamente sobre el sistema
operativo, sin contenedores. Este es el camino que usa infraestructura
que no opera Docker (ver la sección correspondiente en el `README.md`
de la raíz). El código, la configuración y el comportamiento de la
aplicación son exactamente los mismos que en el despliegue con Docker;
lo único que cambia es cómo se instalan y conectan las piezas.

Este ejercicio se hizo y se probó de punta a punta en Rocky Linux 9.
Los comandos específicos de paquetes asumen esa distribución (dnf);
los pasos en sí aplican igual a cualquier RHEL 9 compatible.

> **Infraestructura de SEDATU (DGTIC):** el modelo que definió la DGTIC
> (backend en contenedor con un solo puerto, frontend nativo, base de
> datos y almacén provistos) está en la sección
> [11. Modelo SEDATU](#11-modelo-sedatu-dgtic) al final de este
> documento.

## 1. Requisitos

- **PostgreSQL 15** con **PostGIS 3.3** (o compatible).
- **Node.js 22** (LTS vigente al momento de este despliegue).
- **nginx**.
- Un almacenamiento de archivos **compatible con S3** (MinIO nativo, o
  cualquier otro). El backend habla el protocolo S3 estándar, no nada
  específico de MinIO (ver `backend/src/utils/minio.js`): cualquier
  endpoint S3-compatible funciona sin tocar código, solo variables de
  entorno.

## 2. PostGIS es obligatorio

La base de datos necesita la extensión PostGIS habilitada; un
PostgreSQL genérico no la trae. Esto no es opcional: las consultas de
Territorio (`backend/src/db/queries/geografia.queries.js`) usan
funciones de PostGIS (`ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`,
etc.) directamente en SQL. Se habilita **por base de datos**, una vez:

```sql
\c pspp_db
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

(`pg_trgm` la usa `scripts/cargar-geo.sh` y queda bien tenerla desde
este paso; ver el punto 10 más abajo sobre cuándo se necesita.)

## 3. Usuario de servicio y ubicación del código

Un usuario de sistema sin shell de login, dueño de `/opt/pspp`:

```bash
useradd --system --shell /usr/sbin/nologin --home-dir /opt/pspp --create-home pspp

mkdir -p /opt/pspp /etc/pspp /var/lib/pspp
chown pspp:pspp /opt/pspp /var/lib/pspp
chmod 750 /etc/pspp

# Colocar el código (clonar o copiar el repositorio) en /opt/pspp
git clone <url-del-repositorio> /opt/pspp
chown -R pspp:pspp /opt/pspp
```

## 4. Backend: instalar dependencias

```bash
cd /opt/pspp/backend
sudo -u pspp npm install --omit=dev
```

`--omit=dev` basta para el backend: `nodemon` (la única devDependency,
usada solo para `npm run dev` en desarrollo) nunca se usa en
producción, que arranca con `node src/server.js` directo (ver
`pspp-backend.service`).

## 5. Frontend: compilar y servir solo el resultado

El frontend sí necesita **todas** las dependencias para compilar, dev
incluidas:

```bash
cd /opt/pspp/frontend
sudo -u pspp npm install
```

`vite` (el bundler) es una devDependency: sin ella, `npm run build` no
existe y no hay manera de compilar. No se puede usar `--omit=dev` aquí
como se hizo con el backend.

```bash
sudo -u pspp npm run build
```

Esto genera `frontend/dist/`: los archivos estáticos que nginx va a
servir. Una vez que el build terminó, **las dependencias de desarrollo
ya no hacen falta**: nginx solo lee `dist/`, nunca vuelve a tocar
`node_modules` ni a correr Vite. Si se quiere liberar espacio:

```bash
cd /opt/pspp/frontend
sudo -u pspp rm -rf node_modules
```

### Variables de compilación del frontend (no de ejecución)

Dos variables se leen **solo durante `npm run build`**, nunca después
de que `dist/` ya existe:

- **`VITE_API_URL`**: a dónde apunta el frontend compilado para llamar
  a la API. Por omisión, en el código, es la ruta relativa `/api/v1`
  (`frontend/src/api/client.js` y otros). Con ese valor por omisión, el
  mismo `dist/` compilado funciona en **cualquier dominio** sin
  recompilar: como la ruta es relativa, el navegador la resuelve contra
  el dominio desde el que se sirvió la página, y quien decide a dónde
  va realmente `/api/v1` es nginx (`location /api/` en
  `deploy/nginx/pspp.conf`), no el frontend. No hay que definir esta
  variable a propósito, salvo que el backend viva en un dominio
  distinto al del frontend.
- **`VITE_CARTO_API_KEY`**: la llave del proveedor de mapas base
  (CARTO). Si esta llave cambia, **hay que recompilar** (`npm run
  build` de nuevo) para que el nuevo valor quede incluido en `dist/`;
  cambiarla en el entorno después de compilar no tiene ningún efecto,
  porque ya no hay ningún proceso Node corriendo que lea variables de
  entorno en el frontend, el build es estático.

Para fijar estas variables al compilar: `VITE_API_URL=... VITE_CARTO_API_KEY=... npm run build`
(o exportarlas antes).

## 6. Variables de entorno del backend

Copiar la plantilla y llenarla:

```bash
cp /opt/pspp/deploy/pspp.env.example /etc/pspp/pspp.env
chown root:pspp /etc/pspp/pspp.env
chmod 640 /etc/pspp/pspp.env
# Editar /etc/pspp/pspp.env con los valores reales
```

Ver `deploy/pspp.env.example` para el detalle de cada una de las 22
variables que el backend lee, cuáles son obligatorias, y las dos
advertencias importantes (`FRONTEND_URL` controla CORS;
`UPLOAD_MAX_SIZE_MB` tiene que coincidir con `client_max_body_size` de
nginx).

Crear el directorio de subidas temporales que `UPLOAD_TMP_DIR` declara
en la plantilla:

```bash
mkdir -p /var/lib/pspp/uploads-tmp
chown pspp:pspp /var/lib/pspp/uploads-tmp
```

## 7. Servicio systemd del backend

```bash
cp /opt/pspp/deploy/pspp-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable pspp-backend
```

No arrancarlo todavía: faltan los datos (punto 10) y nginx (punto 8).

## 8. nginx

Antes de copiar la configuración, **revisar si ya hay algo escuchando
el puerto que se va a usar** (8090 en `deploy/nginx/pspp.conf`) o
compitiendo por el `server_name`:

```bash
ls /etc/nginx/conf.d/
grep -rl "listen" /etc/nginx/conf.d/
```

Si no hay conflicto:

```bash
cp /opt/pspp/deploy/nginx/pspp.conf /etc/nginx/conf.d/pspp.conf
nginx -t
systemctl reload nginx
```

`nginx -t` valida la sintaxis antes de aplicar nada; si marca error,
nginx sigue corriendo con la configuración anterior, no se cae.

### SELinux

Si el servidor tiene SELinux en modo `Enforcing` (verificar con
`getenforce`), nginx no puede servir `frontend/dist` ni hablar con el
backend por el socket de red hasta que se le dé permiso explícito. El
síntoma, si se omite este paso, es **403 o 502 sin ninguna causa
aparente en los logs** — el archivo existe, los permisos de Unix están
bien, y aun así nginx no puede leerlo ni conectarse, porque SELinux lo
bloquea en una capa que no aparece en `ls -l` ni en `docker logs`
(aquí no aplica, pero es la misma idea: una capa de permisos adicional
e invisible a simple vista).

```bash
getenforce
# Si dice "Enforcing":
semanage fcontext -a -t httpd_sys_content_t "/opt/pspp/frontend/dist(/.*)?"
restorecon -Rv /opt/pspp/frontend/dist
setsebool -P httpd_can_network_connect 1
```

El primer comando etiqueta el contexto SELinux correcto para que nginx
pueda leer esos archivos; el segundo lo aplica a lo que ya existe en
disco; el tercero permite que nginx (el dominio `httpd_t`) inicie
conexiones de red salientes, que es lo que necesita para hacer
`proxy_pass` hacia el backend en `127.0.0.1:3100`.

## 9. Migración de datos

### 9.1 Base de datos

Restaurar el respaldo de PostgreSQL (ver `scripts/backup.sh` en la
raíz del repositorio para cómo se generó, si se está migrando desde la
instalación en Docker):

```bash
pg_restore -h localhost -U pspp_user -d pspp_db -Fc /ruta/al/respaldo.dump
```

**Importante**: los polígonos de estados, municipios y zonas
metropolitanas (tablas `geo_estados`, `geo_municipios`, `geo_zm`) viven
**en la base de datos**, no en archivos de este repositorio. Una
instalación nueva que solo corre las migraciones (que crean las tablas
vacías) pero nunca restaura ni carga estos datos geográficos **tiene el
mapa de Territorio vacío**, sin que nada marque un error: las consultas
funcionan, simplemente no hay geometría que devolver. Si no se está
restaurando un respaldo con estos datos ya cargados, hay que correr
`scripts/cargar-geo.sh` (requiere `ogr2ogr`/GDAL o `shp2pgsql`,
paquete `postgis` en Rocky Linux, y los shapefiles en
`catalogos/geograficos/`).

### 9.2 Archivos del bucket

Migrar los objetos del almacenamiento anterior al nuevo con `mc`
(cliente de MinIO, compatible con cualquier endpoint S3):

```bash
mc alias set origen https://endpoint-anterior ACCESS_KEY SECRET_KEY
mc alias set destino https://endpoint-nuevo ACCESS_KEY SECRET_KEY
mc mirror origen/pspp-evidencias destino/pspp-evidencias
```

## 10. Arranque y verificación

Orden: base de datos y almacenamiento ya deben estar arriba y con los
datos migrados (punto 9) antes de arrancar el backend.

```bash
systemctl start pspp-backend
systemctl status pspp-backend
journalctl -u pspp-backend -f
```

El backend corre sus migraciones de esquema solas al arrancar (seguro
de repetir, ver `backend/src/db/migrate.js`); el log debe terminar en
`PSPP Backend corriendo en puerto 3100`.

Verificación con `curl`, de adentro hacia afuera:

```bash
# 1. El backend responde directo (sin pasar por nginx)
curl -s http://127.0.0.1:3100/health

# 2. nginx sirve el frontend
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/

# 3. nginx hace el proxy correctamente al backend
curl -s http://localhost:8090/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"correo":"no-existe@ejemplo.org","password":"x"}'
# Se espera un 401 con un JSON de error (credenciales inválidas), no un
# 502 (502 significa que nginx no pudo hablar con el backend) ni un 404
# (significa que la ruta /api/ no está llegando al backend).
```

Si el paso 3 da 502: revisar que `PORT` en `/etc/pspp/pspp.env` sea
`3100` (tiene que coincidir con `proxy_pass` de `pspp.conf`) y que
`pspp-backend` esté activo. Si da 403 en el paso 2: revisar SELinux
(punto 8).

## 11. Modelo SEDATU (DGTIC)

Modelo de despliegue acordado con la DGTIC en la reunión de
transferencia. Comparte código con los otros dos caminos (Docker en el
VPS con `docker-compose.prod.yml`, y nativo con systemd, secciones 1 a
10); lo que cambia es qué pieza corre dónde:

```
                navegador
                    │  HTTPS
                    ▼
   ┌──────────────────────────────────────┐
   │ nginx institucional (DGTIC)          │
   │  /pspp/       → frontend/dist (disco)│
   │  /pspp/api/   → 127.0.0.1:PSPP_PUERTO│
   └───────────────┬──────────────────────┘
                   │ HTTP, solo local
                   ▼
   ┌──────────────────────────────────────┐
   │ contenedor "backend"                 │
   │  (deploy/docker-compose.sedatu.yml)  │
   │  usuario sin privilegios, puerto 3000│
   └──────┬────────────────────┬──────────┘
          │                    │
          ▼                    ▼
   PostgreSQL + PostGIS   almacén S3 (interno,
   (DGTIC)                no publicado; DGTIC)
```

| Pieza | Quién la provee | Cómo |
|---|---|---|
| Backend | PSPP | Imagen de `backend/Dockerfile.sedatu`, un solo servicio en `deploy/docker-compose.sedatu.yml` |
| Frontend | PSPP (código) / DGTIC (servidor) | `npm run build` en el servidor; nginx sirve `frontend/dist` de forma nativa. No va en ningún contenedor |
| Base de datos | DGTIC | PostgreSQL 15 + PostGIS 3.3 (ver sección 2). No se declara en el compose |
| Almacén de objetos | DGTIC | Un bucket S3-compatible por proyecto; QA y producción separados con `MINIO_PREFIX`. No se declara en el compose ni se publica |
| nginx / TLS | DGTIC | Ver 11.5 |

### 11.1 Archivos del modelo

- `deploy/docker-compose.sedatu.yml`: el compose. Un servicio
  (`backend`), un puerto publicado (`PSPP_PUERTO`, por omisión solo en
  `127.0.0.1`), healthcheck, `init`, sin capacidades de Linux,
  `no-new-privileges`, logs rotados (máximo 30 MB). Ninguna credencial:
  todo sale del entorno, y si falta una variable obligatoria compose se
  niega a arrancar diciendo cuál.
- `backend/Dockerfile.sedatu`: imagen de producción. Node 22, solo
  dependencias de producción, el proceso corre como el usuario `node`
  (uid 1000) y el código es de solo lectura para él, `HEALTHCHECK`
  contra `/health`. No reemplaza a `backend/Dockerfile`, que sigue
  siendo el de desarrollo y el del VPS actual.
- `deploy/pspp-sedatu.env.example`: plantilla de variables.

### 11.2 Variables

```bash
install -d -m 750 /etc/pspp
cp deploy/pspp-sedatu.env.example /etc/pspp/pspp-sedatu.env
chmod 600 /etc/pspp/pspp-sedatu.env
# llenar /etc/pspp/pspp-sedatu.env
```

El archivo vive fuera del repositorio. Si el pipeline de la DGTIC
inyecta las variables desde su bóveda de secretos, el archivo no hace
falta: compose toma las variables del entorno del proceso. Puntos que
cambian respecto a los otros despliegues:

- `PSPP_PUERTO`: el puerto que asigne la DGTIC. El backend escucha en
  el 3000 *dentro* del contenedor; no hay que tocar `PORT`.
- `DB_HOST` / `MINIO_ENDPOINT`: si el servicio escucha en el mismo
  servidor, usar `host.docker.internal` (ya está mapeado en el compose).
  `127.0.0.1` dentro del contenedor es el contenedor.
- `MINIO_BUCKET`: el bucket asignado. `MINIO_PREFIX`: `qa` en QA,
  `prod` en producción (ver 11.6).
- `FRONTEND_URL`: la URL pública completa, con su ruta si la tiene
  (`https://sistemas.sedatu.gob.mx/pspp`). CORS se compara contra su
  origen; las ligas de activación de cuenta usan la URL completa.

### 11.3 Backend

```bash
cd /ruta/del/repositorio
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env build
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env up -d
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env ps
```

Al arrancar, el backend aplica sus migraciones (idempotentes, ver
`backend/src/db/migrate.js`) y después empieza a escuchar; por eso el
healthcheck tiene 90 s de gracia. `ps` debe mostrar `healthy`. El
pipeline puede construir la imagen sin compose:

```bash
docker build -f backend/Dockerfile.sedatu -t pspp-backend:sedatu backend
```

y publicarla en su registro; en ese caso, `PSPP_IMAGEN` con la
referencia completa y `up -d` sin `build`.

QA y producción en el mismo servidor: dos archivos de variables (puerto
y `MINIO_PREFIX` distintos) y dos nombres de proyecto:

```bash
docker compose -p pspp-qa   -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-qa.env   up -d
docker compose -p pspp-prod -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-prod.env up -d
```

### 11.4 Frontend (nativo, compilado)

Requiere Node.js 22 en el servidor (o en el equipo del pipeline que
genera `dist/`). Las variables `VITE_*` se leen **solo al compilar**
(sección 5): cambiarlas exige recompilar.

```bash
cd /ruta/del/repositorio/frontend
npm ci
VITE_BASE_PATH=/pspp/ VITE_API_URL=/pspp/api/v1 VITE_CARTO_API_KEY=... npm run build
# el resultado es frontend/dist/; copiarlo a la raíz que sirve nginx
```

- `VITE_BASE_PATH`: ruta bajo la que nginx publica el frontend
  (`/pspp/`, con ambas diagonales). Si la DGTIC asigna un dominio o
  subdominio propio, `/`.
- `VITE_API_URL`: ruta pública de la API, la que nginx manda al
  backend (`/pspp/api/v1`). Si el frontend va en la raíz, se omite
  (`/api/v1` por omisión).
- Terminado el build, `node_modules` ya no hace falta.

**Pendiente conocido para servir bajo `/pspp/`:** algunas imágenes y
redirecciones del frontend usan rutas absolutas a la raíz
(`/sedatu-logo.png`, `/logo_pspp2.png`, la redirección a `/login` al
vencer la sesión, `/proyectos/nuevo`, `/docs/api-indicadores.md`) y no
respetan `VITE_BASE_PATH`. Bajo un subdirectorio esos logos no cargan y
esas redirecciones salen del subdirectorio. Con el frontend en la raíz
de un (sub)dominio no ocurre. Se atiende aparte de este cambio.

### 11.5 Qué espera encontrar el nginx institucional

El backend no sirve archivos estáticos ni termina TLS; todo eso es del
nginx de la institución. Lo que necesita:

1. **Frontend**: servir `frontend/dist` bajo la ruta base, con
   *fallback* a `index.html` (la aplicación usa rutas del lado del
   navegador; sin el fallback, recargar cualquier pantalla da 404).
2. **API**: `/pspp/api/` → `http://127.0.0.1:PSPP_PUERTO/api/`. La
   diagonal final de `proxy_pass` quita el prefijo `/pspp`: el backend
   solo conoce `/api/v1/...`.
3. **Notificaciones en tiempo real** (`/pspp/api/v1/notificaciones/stream`,
   Server-Sent Events): `proxy_buffering off` y `proxy_read_timeout`
   largo. Sin esto la campana de notificaciones deja de actualizarse
   sola, sin ningún error visible (sección 8).
4. **Subidas**: `client_max_body_size` igual a `UPLOAD_MAX_SIZE_MB`
   (200 MB por omisión) y `proxy_request_buffering off`, para que
   nginx no escriba primero su propia copia del archivo en disco.
5. **Descargas y vistas previas**: `proxy_max_temp_file_size 0`, para
   que nginx no guarde en disco una copia de los archivos grandes que
   transmite el backend. nginx deja pasar `Range` sin configurar nada:
   el visor de PDF del navegador lo necesita y el backend responde 206.
6. **Cabeceras**: `X-Forwarded-For` / `X-Forwarded-Proto` / `Host`, como
   en cualquier proxy.
7. **Nada del almacén**: ninguna `location` apunta al almacén de
   objetos. El navegador nunca habla con él (11.6).
8. `/health` no necesita publicarse: lo usa el healthcheck del
   contenedor, desde dentro.

Configuración de referencia (validar con `nginx -t`; ajustar
`PSPP_PUERTO` y la ruta de `dist`):

```nginx
# dentro del server {} institucional (TLS ya configurado ahí)

location = /pspp { return 301 /pspp/; }

location /pspp/ {
    alias /opt/pspp/frontend/dist/;
    try_files $uri $uri/ /pspp/index.html;
}

location /pspp/api/v1/notificaciones/stream {
    proxy_pass http://127.0.0.1:PSPP_PUERTO/api/v1/notificaciones/stream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;
}

location /pspp/api/ {
    proxy_pass http://127.0.0.1:PSPP_PUERTO/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200M;      # = UPLOAD_MAX_SIZE_MB
    proxy_request_buffering off;    # subidas: sin copia en disco de nginx
    proxy_max_temp_file_size 0;     # descargas: sin copia en disco de nginx
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

Con SELinux en `Enforcing`, aplican los mismos ajustes de la sección 8
(`httpd_sys_content_t` sobre `dist`, `httpd_can_network_connect`).

### 11.6 Almacén de objetos

**Nunca se publica.** La plataforma no genera URLs firmadas ni
temporales, y el frontend nunca arma una URL hacia el almacén. Todo
archivo pasa por el backend:

| Endpoint | Uso | `Content-Disposition` |
|---|---|---|
| `GET /api/v1/evidencias/:id/ver` | Vista previa (iframe, `<img>`, capas geográficas) | `inline` |
| `GET /api/v1/evidencias/:id/descargar` | Botón "Descargar" | `attachment` |
| `GET /api/v1/actividad/:id/ver` | Vista previa de adjuntos de tareas | `inline` |
| `GET /api/v1/actividad/:id/descargar` | Descarga de adjuntos de tareas | `attachment` |
| `GET /api/v1/proyectos/:id/imagen` | Portada del proyecto | `inline` |

El backend valida el permiso del usuario sobre la evidencia **antes**
de abrir el flujo hacia el almacén; la clave del objeto sale de la base
de datos, nunca de la petición, así que conocer el identificador de un
objeto no basta para descargarlo. Transmite por flujo, sin cargar el
archivo en memoria (las capas geográficas pesan cientos de MB), soporta
`Range` (206/416), responde 404 si el objeto ya no está en el almacén y
corta la lectura del almacén en cuanto el navegador cierra la
conexión. Implementación: `backend/src/utils/transmitirObjeto.js`.

**Prefijo por ambiente.** `MINIO_PREFIX` se antepone a toda clave al
escribir, leer, copiar y borrar (`backend/src/utils/minio.js`); la base
de datos guarda la clave sin prefijo. Con `MINIO_PREFIX=qa`, una
evidencia queda en `<bucket>/qa/evidencias/...`.

**Credencial del almacén.** Basta con permisos sobre los objetos del
prefijo del ambiente (`GetObject`, `PutObject`, `DeleteObject`) más
`ListBucket`/`HeadBucket` sobre el bucket (al arrancar se comprueba que
existe). El bucket lo crea la DGTIC: si ya existe, el backend no
intenta crearlo, y si no puede comprobarlo solo deja un aviso en el log.

**Migrar archivos** desde la instalación anterior (que no usa prefijo)
al bucket de la DGTIC, bajo el prefijo del ambiente:

```bash
mc alias set origen  https://endpoint-anterior ACCESS_KEY SECRET_KEY
mc alias set destino https://endpoint-dgtic    ACCESS_KEY SECRET_KEY
mc mirror origen/pspp-evidencias destino/<bucket-asignado>/prod
```

Las filas de la base no se tocan: guardan la clave sin prefijo.

### 11.7 Disco

El servidor tiene poco espacio; nada de la plataforma se acumula:

- **Temporales de subida**: el backend escribe cada archivo a un
  temporal mientras lo manda al almacén y lo borra siempre: al
  terminar bien, si el almacén falla, si se rechaza la petición por
  permisos y si el navegador corta la subida a la mitad. Al arrancar y
  cada hora barre los que hubiera dejado un proceso muerto a la fuerza.
  Viven dentro del contenedor (`/tmp/pspp-uploads`).
- **Logs del contenedor**: rotan, 3 × 10 MB como máximo.
- **nginx**: `proxy_request_buffering off` y `proxy_max_temp_file_size 0`
  (11.5) evitan sus copias en disco.
- **Imagen**: después de actualizar, `docker image prune -f` borra las
  versiones anteriores sin uso.

### 11.8 Verificación

```bash
# 1. Contenedor sano
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env ps
curl -s http://127.0.0.1:PSPP_PUERTO/health

# 2. Solo un puerto publicado, y solo en la interfaz esperada
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env port backend 3000

# 3. El proceso no corre como root (debe decir "node")
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env exec backend whoami

# 4. nginx → frontend y nginx → API
curl -s -o /dev/null -w "%{http_code}\n" https://sistemas.sedatu.gob.mx/pspp/
curl -s https://sistemas.sedatu.gob.mx/pspp/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"correo":"no-existe@ejemplo.org","password":"x"}'
# Se espera 401 con JSON de error (no 502 ni 404; ver sección 10).
```

### 11.9 Actualizar

```bash
cd /ruta/del/repositorio
git pull
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env build
docker compose -f deploy/docker-compose.sedatu.yml --env-file /etc/pspp/pspp-sedatu.env up -d
docker image prune -f
# si cambió el frontend:
cd frontend && npm ci && VITE_BASE_PATH=/pspp/ VITE_API_URL=/pspp/api/v1 VITE_CARTO_API_KEY=... npm run build
```

Igual que en el VPS: si el cambio toca frontend y backend, actualizar
los dos. A diferencia del VPS, aquí nginx habla con el backend por
`127.0.0.1:PSPP_PUERTO` (un puerto fijo, no la IP interna de un
contenedor), así que recrear el contenedor **no** exige reiniciar nginx.
