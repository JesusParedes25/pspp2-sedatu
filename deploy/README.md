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

Ver `deploy/pspp.env.example` para el detalle de cada una de las 21
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
