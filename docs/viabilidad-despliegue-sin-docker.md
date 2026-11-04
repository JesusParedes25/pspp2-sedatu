# PSPP v2.0: viabilidad de desplegar sin Docker

Documento de análisis para la Dirección General de Tecnologías de la
Información de SEDATU (DGTIC), insumo para decidir cómo desplegar PSPP
v2.0 en infraestructura propia y para redactar el manual de despliegue
correspondiente. No es el manual en si: es el diagnostico que precede
a esa decision.

Hoy la plataforma corre completa bajo `docker-compose.prod.yml`: seis
servicios (postgres, minio, geoserver, backend, nginx, frontend-build)
en contenedores, en el servidor `srv885729`, detras de Nginx Proxy
Manager (NPM), un sistema separado que no vive en este repositorio.

Toda afirmacion de este documento esta respaldada por el codigo tal
como esta hoy en el repositorio, citado por archivo y linea. Donde no
se pudo verificar algo desde el codigo, se dice explicitamente y se
deja como pregunta para DGTIC (parte 9).

## Resumen ejecutivo

- De los seis servicios, **GeoServer no se usa**: esta provisionado
  pero ningun codigo que corre hoy lo llama (parte 2). Se recomienda
  retirarlo del despliegue, no migrarlo.
- El **backend es el servicio mas facil de sacar de Docker**: sin
  dependencias nativas, sin procesos hijos, sin llamadas salientes a
  internet. Lee toda su configuracion de variables de entorno, igual
  adentro o afuera de un contenedor.
- **MinIO ya habla el protocolo S3 estandar**, sin nada especifico de
  MinIO en el codigo: correrlo fuera de Docker, o apuntarlo a otro
  almacenamiento S3-compatible que DGTIC ya opere, no exige tocar una
  sola linea de codigo (parte 3).
- **PostgreSQL con PostGIS** es la pieza con el unico prerequisito
  institucional no trivial: que DGTIC tenga o pueda instalar PostGIS,
  no solo Postgres.
- Hoy nada esta expuesto al exterior salvo a traves de Nginx Proxy
  Manager, que es quien termina TLS. Todo el trafico interno entre
  servicios es HTTP plano (parte 4).
- Las migraciones de base de datos corren solas en cada arranque del
  backend, con una tabla de control que las hace seguras de repetir,
  pero sin ningun candado que impida arrancar contra un esquema
  inesperado (parte 6).
- Recomendacion (parte 8): escenario mixto. Sacar backend, nginx y
  frontend-build de Docker ya, sin ningun cambio de codigo; retirar
  GeoServer; decidir Postgres y MinIO en la reunion con DGTIC segun lo
  que ya operen.

## Parte 1. Inventario servicio por servicio

Escala de dificultad usada abajo, para que sea verificable y no una
opinion: se basa en (a) cuantos sitios de codigo por archivo y linea
habria que tocar, (b) si existe un sustituto compatible con el mismo
protocolo sin tocar codigo, y (c) si el tooling operativo de hoy
(respaldos, healthchecks, reinicio automatico) depende de Docker y
habria que reescribirlo. Niveles: **Trivial**, **Baja**, **Moderada**,
**Alta**, **No aplica** (cuando la pregunta correcta no es "que tan
dificil" sino "por que esta aqui").

### PostgreSQL + PostGIS

- **Que es y version**: PostgreSQL 15 con la extension PostGIS 3.3,
  imagen `postgis/postgis:15-3.3` (`docker-compose.prod.yml:10`).
- **Para que se usa**: es la unica base de datos de la plataforma.
  Acceso via SQL crudo con el driver `pg`, sin ORM
  (`backend/src/db/pool.js`). Las funciones espaciales de PostGIS
  (`ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`) arman el GeoJSON de
  estados/municipios/zonas metropolitanas que consume el mapa de
  Territorio (`backend/src/db/queries/geografia.queries.js:396,416,434`).
- **Que haria falta fuera de Docker**: PostgreSQL 15.x nativo, con la
  extension PostGIS 3.3.x instalada y habilitada
  (`CREATE EXTENSION postgis;`) en la base de datos de PSPP. Esta
  extension es el unico prerequisito no trivial: un Postgres generico
  no la trae por omision. El driver `pg` es JavaScript puro, sin
  compilacion nativa.
- **Datos persistentes**: toda la base de datos. Hoy en el volumen
  Docker `pgdata_prod` (`docker-compose.prod.yml:18,121`). Respaldo
  actual via `pg_dump` dentro del contenedor (`scripts/backup.sh:51-52`,
  usa `docker exec`).
- **Dificultad: Baja**. Cambio de codigo: ninguno. El backend ya se
  conecta por host/puerto/usuario/contrasena leidos de variables de
  entorno (`backend/src/db/pool.js:18-22`), sin ninguna referencia a
  que el proceso corra en un contenedor. El unico trabajo es
  administrativo: instalar PostGIS si no esta, y reescribir el paso 1
  de `scripts/backup.sh` para que use `pg_dump` directo contra el host
  en vez de `docker exec`.

### MinIO

- **Que es y version**: MinIO, almacenamiento de objetos compatible
  con S3, imagen `minio/minio:latest` (`docker-compose.prod.yml:29`).
  La etiqueta `latest` no esta fijada a una version exacta: cada
  rebuild puede traer una version distinta sin que nadie lo decida.
- **Para que se usa**: documentos y evidencias de proyectos. Ver parte
  3 para el detalle completo con archivo y linea.
- **Que haria falta fuera de Docker**: el SDK que usa el backend
  (paquete npm `minio`, `backend/src/utils/minio.js:9-15`) habla el
  protocolo S3 estandar, sin ninguna llamada exclusiva de MinIO.
  Correrlo fuera de Docker significa instalar el binario nativo de
  MinIO (existe sin Docker) o, sin tocar codigo, apuntar las mismas
  variables de entorno a cualquier otro endpoint S3-compatible que
  DGTIC ya opere.
- **Datos persistentes**: los archivos subidos. Hoy en el volumen
  `minio_prod` (`docker-compose.prod.yml:37,122`). Respaldo actual:
  `tar` del volumen via un contenedor temporal con `--volumes-from`
  (`scripts/backup.sh:69-72`), que asume Docker.
- **Dificultad: Baja** si DGTIC ya tiene o puede usar un endpoint
  S3-compatible (cero cambios de codigo, solo variables de entorno).
  **Moderada** si en cambio se opta por disco plano local: no hay
  obstaculo arquitectonico, pero si tocar los sitios de llamada
  listados en la parte 3.

### GeoServer

- **Que es y version**: GeoServer 2.23.0, distribucion
  `kartoza/geoserver:2.23.0` (`docker-compose.prod.yml:43`), servidor
  de capas WMS/WFS.
- **Para que se usa**: nada en el codigo que corre hoy. Ver parte 2.
- **Que haria falta fuera de Docker**: no aplica. GeoServer es una
  aplicacion Java (Tomcat empaquetado en la imagen), asi que fuera de
  Docker exigiria un JRE/JDK y configuracion de Tomcat propia, pero
  como no se usa, la pregunta correcta es si entregarlo, no como
  entregarlo.
- **Datos persistentes**: su volumen de configuracion
  (`geoserver_prod`) no tiene ninguna capa publicada. El propio
  `README.md:282` lo documenta: "GeoServer sin capas: Modulo
  cartografico es segunda fase (TODO)". No hay nada que respaldar.
- **Dificultad: No aplica**. Recomendacion: retirarlo del despliegue
  (quitar el servicio del compose y las variables `GEOSERVER_USER`,
  `GEOSERVER_PASSWORD`, `GEOSERVER_ADMIN_PASSWORD`, `GEOSERVER_URL`),
  no migrarlo. Si en el futuro se retoma el modulo de "cobertura"
  (`frontend/src/components/seguimiento/MapaCobertura.jsx`, hoy sin
  usar en ninguna pantalla), se vuelve a evaluar entonces.

### Backend (Node/Express)

- **Que es y version**: aplicacion Node.js/Express. Construida hoy con
  Node 18 (`node:18-alpine`, `backend/Dockerfile:3`). Node 18 ya
  termino su soporte oficial (EOL, abril de 2025); esto es cierto
  independientemente de Docker.
- **Para que se usa**: toda la logica de negocio, autenticacion,
  acceso a la base de datos, orquestacion de MinIO.
- **Que haria falta fuera de Docker**: Node.js instalado (se
  recomienda actualizar a una version con soporte activo, 20.x o 22.x
  LTS; nada en el codigo exige especificamente la 18, no hay campo
  `engines` en `backend/package.json` que la fije). Ningun paquete con
  compilacion nativa: `bcryptjs` es JavaScript puro (no la version
  nativa `bcrypt`), y no hay `sharp`, `canvas`, `sqlite3` ni similares
  entre las dependencias. `npm install --production` y
  `node src/server.js` bastan para arrancarlo. Si hace falta reiniciar
  el proceso solo cuando truena, y capturar su salida, hoy eso lo da
  `restart: always` mas `docker logs`; fuera de Docker hace falta un
  gestor de procesos (pm2, systemd, supervisord).
- **Datos persistentes**: ninguno propio; es sin estado, todo vive en
  Postgres o MinIO.
- **Dificultad: Baja**. El mas facil de los tres servicios con
  dependencias externas. Cambio de codigo: ninguno estrictamente
  necesario. Se recomienda, no se exige, fijar la version de Node con
  un `engines` en `package.json` o un `.nvmrc` (hoy ausente).

### Nginx

- **Que es y version**: `nginx:alpine` (`docker-compose.prod.yml:92`),
  etiqueta tampoco fijada a una version exacta.
- **Para que se usa**: proxy inverso interno (reparte `/api/*` al
  backend, todo lo demas a los archivos estaticos del frontend) y no
  termina TLS (ver parte 4).
- **Que haria falta fuera de Docker**: un nginx nativo (viene en el
  repositorio de paquetes de cualquier distro) con
  `nginx/default.conf` adaptado: hoy usa el nombre de servicio Docker
  `backend` (`nginx/default.conf:31,44`); fuera de Docker seria
  `localhost` (si corre en la misma maquina que el backend) o la
  IP/host real.
- **Datos persistentes**: ninguno propio; sirve el build estatico del
  frontend desde un volumen compartido, generado por otro servicio.
- **Dificultad: Baja**. El mas agnostico a Docker de los seis: el
  cambio es una linea en `nginx/default.conf:31,44`. Cambio de codigo
  de la aplicacion: ninguno.

### frontend-build

- **Que es**: no es un servicio en ejecucion, es un contenedor de un
  solo uso que compila el frontend (`npm run build`, Vite) y copia
  `dist/` a un volumen que nginx sirve
  (`docker-compose.prod.yml:106-118`).
- **Para que se usa**: generar los archivos estaticos de produccion.
- **Que haria falta fuera de Docker**: Node.js (la misma version que
  el backend o distinta, ya que solo corre en tiempo de build, nunca
  en produccion) y `npm run build`. No hay pasos de build inusuales
  (sin codegen, sin empaquetar datasets grandes): es un `vite build`
  estandar (`frontend/package.json:9`, `frontend/vite.config.js`). No
  se midio el tiempo exacto en este analisis.
- **Datos persistentes**: ninguno; su unica salida es el build
  estatico, que tiene que llegar a donde nginx lo sirva.
- **Dificultad: Trivial**. No es un servicio que opere en produccion,
  es un paso de build/CI. Cambio de codigo: ninguno.

## Parte 2. GeoServer: veredicto con evidencia

**Veredicto: no se usa. Es un servicio heredado, sin conexion con la
aplicacion que corre hoy.**

1. El unico archivo de la aplicacion que de verdad construye una
   peticion WMS a GeoServer es
   `frontend/src/components/seguimiento/MapaCobertura.jsx` (lineas
   17, 88, 99: `WMSTileLayer url={GEOSERVER_URL}/pspp/wms`, capas
   `pspp:vw_geo_estados` y `pspp:vw_geo_municipios`). Ningun otro
   archivo del frontend importa `MapaCobertura`: es codigo escrito y
   nunca conectado a ninguna pantalla ni ruta.
2. El mapa de Territorio que si esta en uso
   (`frontend/src/components/seguimiento/MapaProyecto.jsx`) obtiene
   sus poligonos de la propia API de PSPP:
   `client.get('/geo/estados/geojson')`, `/geo/zm/geojson`,
   `/geo/municipios/geojson` (lineas 81, 96, 167), renderizados con el
   componente `<GeoJSON>` de react-leaflet (lineas 293-311). Las
   teselas base del mapa vienen de CARTO
   (`frontend/src/utils/cartoBasemap.js`), no de GeoServer.
3. Del lado del backend, esas rutas de `/geo/...` arman el GeoJSON
   directamente contra PostGIS con
   `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, ...))`
   (`backend/src/db/queries/geografia.queries.js:396,416,434`). No hay
   ninguna llamada HTTP a GeoServer en todo `backend/src`.
4. El propio proyecto lo documenta: `README.md:282`, tabla de
   solucion de problemas: "GeoServer sin capas: Modulo cartografico es
   segunda fase (TODO)".
5. Los dos compose (`docker-compose.yml`, `docker-compose.prod.yml`)
   configuran el servicio y pasan `GEOSERVER_URL` al backend
   (`docker-compose.prod.yml:76`), pero ningun archivo bajo
   `backend/src` lee `process.env.GEOSERVER_URL` ni ninguna variable
   `GEOSERVER_*`: la variable llega al contenedor y nadie la lee.
6. `scripts/cargar-geo.sh` es un script de aprovisionamiento manual
   (requiere `ogr2ogr`/GDAL o `shp2pgsql` en quien lo corre) que carga
   shapefiles directo a PostGIS y crea las vistas
   `vw_geo_estados`/`vw_geo_municipios` que GeoServer *leeria* si
   estuviera conectado. Es la pieza de infraestructura que GeoServer
   necesitaria para servir algo, y confirma que esas vistas hoy sirven
   a la API de PSPP, no a GeoServer.

No se encontro ninguna referencia no obvia (pantalla de administrador,
exportacion, feature flag) mas alla de `MapaCobertura.jsx`.
**Recomendacion: no entregar GeoServer a DGTIC.**

## Parte 3. MinIO: acoplamiento y costo de cambiar a disco

**Protocolo: generico, no especifico de MinIO.** El backend usa el
paquete npm `minio` (`backend/src/utils/minio.js`), que es un cliente
S3 estandar: no se usa ninguna API exclusiva de MinIO (sin
notificaciones de bucket, sin API de administracion de MinIO, sin
encabezados propietarios). Correria sin cambios contra AWS S3, Wasabi,
Backblaze B2 o cualquier otro endpoint S3-compatible, solo cambiando
variables de entorno.

**Un problema de acoplamiento que si existe, pero no con MinIO**:
`backend/src/controllers/proyectos.controller.js:31-41` crea su propio
cliente MinIO por separado en vez de reusar el de `utils/minio.js`
(que si usan `evidencias.controller.js:60`,
`actividad.controller.js:8`, `db/queries/duplicar.queries.js:25`).
Cualquier cambio de almacenamiento toca este archivo por duplicado.

**Sitios de llamada por operacion** (archivo:linea):

| Operacion | Archivo:linea |
|---|---|
| Verificar/crear bucket | `evidencias.controller.js:66,68` |
| Subir (`putObject`) | `evidencias.controller.js:133,175,249,281`; `actividad.controller.js:59`; `proyectos.controller.js:373` |
| Descargar/transmitir (`getObject`) | `evidencias.controller.js:330`; `actividad.controller.js:82`; `proyectos.controller.js:426` |
| Borrar (`removeObject`) | `evidencias.controller.js:352`; `duplicar.queries.js:392` |
| Metadatos (`statObject`) | `proyectos.controller.js:421` |
| Copiar (`copyObject`, al duplicar proyecto) | `duplicar.queries.js:345` |

No se encontro ninguna URL firmada (presigned): toda descarga pasa por
el backend, que llama `getObject` y transmite el resultado por la
respuesta HTTP. Esto importa para el costo de cambiar a disco: no se
pierde ninguna funcionalidad por no tener URLs firmadas, porque hoy
tampoco se usan.

**Costo de cambiar a almacenamiento en disco: bajo, cambio casi
directo.** Las 12 llamadas de la tabla usan solo 6 operaciones, cada
una mapeable 1 a 1 a una llamada de `fs`: `putObject` a escribir
archivo, `getObject` a leer un stream, `removeObject` a borrar,
`statObject` a `fs.stat`, `copyObject` a `fs.copyFile`,
`bucketExists`/`makeBucket` a crear una carpeta base. La forma mas
limpia seria un modulo local que exponga esas mismas 5-6 funciones
sobre disco, y redirigir los 4 archivos de la tabla (incluyendo el
cliente duplicado) a ese modulo en vez de a `minio.js`. Nada
arquitectonico lo bloquea.

**Contexto de volumen de archivos**: los limites de subida de
`multer` no son consistentes entre rutas: `actividad.routes.js:20` y
`admin.routes.js:13` permiten hasta 200MB por archivo con
`memoryStorage` (cada subida se guarda completa en RAM antes de
llamar a `putObject`, algo a considerar para cualquier backend de
almacenamiento, no solo para disco); `proyectos.routes.js:21` limita a
5MB. No se encontro una lista blanca de tipos de archivo: se acepta el
`mimetype` que reporte el cliente.

**Variables de entorno involucradas** (nombres, sin valores):
`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_USER`,
`MINIO_PASSWORD`, `MINIO_BUCKET`.

## Parte 4. Puertos y red

### Como entra el trafico hoy

```
Internet (HTTPS, 443)
    |
    v
Nginx Proxy Manager (fuera de este repositorio, termina TLS)
    |  (red Docker externa "nginx-proxy-manager_default")
    v
contenedor "nginx" (puerto 80, HTTP plano, sin publicar al host)
    |
    +-- "/"                                  -> archivos estaticos
    +-- "/api/v1/notificaciones/stream"       -> backend:3000 (SSE)
    +-- "/api/*"                              -> backend:3000
    +-- "/health"                             -> backend:3000/health
```

### Tabla de puertos (produccion, `docker-compose.prod.yml`)

| Servicio | Puerto | Expuesto al exterior | Protocolo | Quien le habla |
|---|---|---|---|---|
| nginx | 80 | No (ni siquiera al host; solo alcanzable por otros contenedores de `pspp-network` y `npm-network`) | HTTP | Nginx Proxy Manager (via `npm-network`) |
| backend | 3000 | No (solo dentro de `pspp-network`) | HTTP | nginx (`nginx/default.conf:31,44,62`) |
| postgres | 5432 | No (solo dentro de `pspp-network`) | TCP, protocolo Postgres | backend (`pool.js`) |
| minio | 9000 (API) | No (en produccion, sin `ports:` en absoluto; si en desarrollo, publicado 9000/9001) | HTTP, API S3 | backend |
| minio | 9001 (consola web) | No en produccion | HTTP | nadie en produccion (sin acceso directo salvo tunel manual) |
| geoserver | 8080 | No | HTTP | nadie (no usado, parte 2) |

Nada en el compose de produccion publica un puerto al sistema
operativo host (ninguno de los seis servicios tiene seccion `ports:`
salvo `nginx`, y `nginx` tampoco la tiene; solo se unen a redes Docker
internas). Comparar con desarrollo (`docker-compose.yml`), donde
postgres (5433->5432), minio (9000, 9001), geoserver (8080) y backend
(3000) si publican puertos al host, para que un desarrollador los
alcance desde fuera de Docker.

### Puertos hoy implicitos que se volverian explicitos sin Docker

- **Backend -> Postgres**: hoy `DB_HOST=postgres` es un nombre de
  servicio que Docker resuelve solo (`docker-compose.prod.yml:63`).
  Fuera de Docker seria una IP o hostname real, y si viven en maquinas
  distintas, un firewall tendria que permitir ese trafico
  explicitamente (hoy el aislamiento lo da gratis la red privada de
  Docker: nada fuera de `pspp-network` puede llegar a postgres:5432
  aunque no haya ningun firewall configurado a mano).
- **Backend -> MinIO**: mismo caso, `MINIO_ENDPOINT=minio`
  (`docker-compose.prod.yml:70`) es hoy un nombre resuelto por Docker.
- **Nginx -> Backend**: `proxy_pass http://backend:3000`
  (`nginx/default.conf:31,44`) es el mismo patron.
- En los tres casos, sacar el servicio de Docker no cambia el puerto
  en si, pero si obliga a decidir y documentar explicitamente la regla
  de firewall que hoy la red de Docker provee sin que nadie la
  escriba.

### TLS

**Hoy, TLS se termina en Nginx Proxy Manager**, un sistema separado
que no esta en este repositorio y que esta sesion de analisis no pudo
inspeccionar (no hay acceso a su configuracion desde el codigo de
PSPP). Todo lo que pasa detras de NPM, incluido el nginx de este
proyecto y cada salto entre contenedores, es HTTP sin cifrar.
`nginx/default.conf` no tiene ningun bloque `listen 443` ni
certificado: escucha solo el puerto 80 (linea 14). Esto es aceptable
hoy porque todos los contenedores comparten una red Docker privada que
nada externo alcanza. Si al desdockerizar las piezas terminan en
maquinas fisicas o virtuales distintas, ese trafico interno cruzaria
una red real sin cifrar a menos que se agregue TLS entre capas, o que
todo siga viviendo en el mismo host.

### Subida de archivos grandes y SSE

Dos configuraciones de `nginx/default.conf` que cualquier reemplazo de
nginx (el de DGTIC, si usan otro) tendria que replicar:

- `client_max_body_size 200M` y timeouts de 300s en `/api/`
  (`nginx/default.conf:55-57`), para subir shapefiles.
- `proxy_buffering off`, `proxy_cache off` y
  `proxy_read_timeout 24h` en `/api/v1/notificaciones/stream`
  (`nginx/default.conf:37-39`), porque es una conexion SSE de larga
  duracion: con buffering normal, las notificaciones en tiempo real
  llegarian todas juntas al final en vez de una por una. El propio
  backend manda un ping cada 25 segundos para mantener la conexion
  viva (`backend/src/utils/sse.js`); cualquier proxy nuevo necesita un
  timeout de lectura mayor a eso.

## Parte 5. Variables de entorno

Agrupadas. Nunca se escribe el valor de un secreto, solo si lo es, si
tiene un valor por omision no secreto, y donde se lee.

### Base de datos

| Variable | Que hace | Secreto | Por omision | Obligatoria |
|---|---|---|---|---|
| `DB_NAME` | Nombre de la base | No | Ninguno en codigo | Si, sin ella `pg` falla al conectar |
| `DB_USER` | Usuario de Postgres | No (nombre de usuario, no contrasena) | Ninguno | Si |
| `DB_PASSWORD` | Contrasena de Postgres | **Si** | Ninguno | Si |
| `DB_PORT` | Puerto de Postgres | No | Sin `||` en codigo; si falta, `pg` usa su propio 5432 | Recomendada |
| `DB_HOST` | Host de Postgres | No | Ninguno en codigo; en produccion esta fijo al literal `postgres` en `docker-compose.prod.yml:63`, no viene de `.env` | Si |

Leidas en `backend/src/db/pool.js:18-22`. Ninguna de las tres falla
con un mensaje claro al arrancar: si faltan, el primer intento de
conexion falla con el error nativo de `pg`, no con un mensaje de PSPP.

### JWT / autenticacion

| Variable | Que hace | Secreto | Por omision | Obligatoria |
|---|---|---|---|---|
| `JWT_SECRET` | Firma los tokens de sesion | **Si** | Ninguno | Si, sin ella el login truena al primer intento, no al arrancar |
| `JWT_EXPIRES_IN` | Duracion del token | No | `48h` | No |

`auth.controller.js:83-84`, `auth.middleware.js:36`.

### Superadministrador

| Variable | Que hace | Secreto | Por omision | Obligatoria |
|---|---|---|---|---|
| `SUPERADMIN_EMAIL` | Correo de la cuenta superadmin | No | `jesus.paredes@sedatu.gob.mx` | Recomendada |
| `SUPERADMIN_NOMBRE` | Nombre de esa cuenta | No | `Jesus Paredes`. Falta en `.env.example` aunque el codigo si la lee | No |
| `PASSWORD_USER` | Contrasena de esa cuenta, **se reaplica en cada arranque** | **Si** | Ninguno; si falta, el seeder solo avisa y no crea la cuenta (no truena el arranque) | Si, para poder entrar la primera vez |

`backend/src/db/seeders/00_superadmin.js:17-19`.

### MinIO

| Variable | Que hace | Secreto | Por omision | Obligatoria |
|---|---|---|---|---|
| `MINIO_USER` | Usuario administrador | **Si** | Ninguno | Si |
| `MINIO_PASSWORD` | Contrasena | **Si** | Ninguno | Si |
| `MINIO_BUCKET` | Bucket de evidencias | No | `pspp-evidencias` | No |
| `MINIO_PORT` | Puerto del API | No | `9000` | No |
| `MINIO_ENDPOINT` | Host de MinIO | No | `minio`; falta en `.env.example`, solo esta fijada en los compose | Si en la practica |
| `MINIO_USE_SSL` | Si hablar HTTPS con MinIO | No | Cualquier valor distinto al texto `"true"` se trata como `false` | No |

`backend/src/utils/minio.js:9-15` y duplicado en
`proyectos.controller.js:38-39`.

### GeoServer (variables sin uso real, ver parte 2)

`GEOSERVER_USER`, `GEOSERVER_PASSWORD`, `GEOSERVER_ADMIN_PASSWORD`:
las tres estan en `.env.example` y le llegan al contenedor de
GeoServer, pero ninguna, ni `GEOSERVER_URL`, se lee en ningun archivo
de `backend/src`. Se pueden retirar junto con el servicio.

### Frontend / red

| Variable | Que hace | Secreto | Por omision | Obligatoria |
|---|---|---|---|---|
| `FRONTEND_URL` | URL publica del frontend, usada para armar ligas de activacion/invitacion y para la lista blanca de CORS | No | `http://localhost:5173` | Si, en produccion |
| `VITE_API_URL` | A donde apunta el frontend compilado para llamar la API | No | `/api/v1` | No |
| `VITE_CARTO_API_KEY` | Llave del proveedor de teselas base del mapa | **Si**, pero de bajo riesgo (si falta, el mapa simplemente no carga teselas) | Vacio | No |
| `VITE_GEOSERVER_URL` | URL de GeoServer que lee el componente sin usar `MapaCobertura.jsx` | No | No esta en `.env.example` ni en ningun compose | No, el componente que la usa no esta conectado a nada |
| `PORT` | Puerto donde escucha el backend | No | `3000` | No |
| `NODE_ENV` | Activa comportamiento de produccion (sin seeders de demo, sin stack traces en errores) | No | Cualquier valor distinto al texto `development` se trata como produccion | Si, en produccion debe ser literalmente `production` |

### SMTP (configuracion sin uso, ver parte 7)

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`:
estan documentadas en `.env.example` y en el `README.md`, pero
ningun archivo de `backend/src` las lee. El correo real se manda desde
el navegador via EmailJS, no desde el backend por SMTP (parte 7). Son
configuracion heredada de un diseno anterior.

## Parte 6. Migraciones automaticas

**Hoy corren solas, en cada arranque del backend, sin excepcion**:
`backend/src/server.js:90` llama `ejecutarMigraciones()` antes de
levantar el servidor HTTP, en cualquier entorno. `npm run migrate`
tambien existe como paso manual separado (`backend/src/db/migrate.js:85-89`),
pero no reemplaza lo anterior: el arranque normal lo hace igual.

**Es seguro repetirlas**: existe una tabla de control
`schema_migrations(nombre, aplicada_at)`, creada si falta
(`migrate.js:26-30`). Solo se ejecutan los archivos `.sql` que todavia
no estan en esa tabla, en orden alfabetico (`migrate.js:34-42`);
volver a correr `npm run migrate` contra un esquema ya al dia no hace
nada (`migrate.js:44-46`, imprime "nada nuevo que aplicar"). Hay 86
archivos de migracion hoy. El estilo idempotente que describe
`CLAUDE.md` (bloques `DO $$ ... IF NOT EXISTS`) no es literal en
absolutamente todas: algunas usan formas nativas de Postgres como
`CREATE TABLE IF NOT EXISTS` directamente; el efecto de fondo (segura
de repetir) es el mismo en todas las revisadas.

**Que pasa si una migracion falla**: cada archivo corre dentro de su
propia transaccion (`BEGIN`/`COMMIT`/`ROLLBACK`,
`migrate.js:54-60,63`). Si el error es porque el objeto ya existe
(codigos `42P07`/`42710`, o el texto "already exists"), se marca como
aplicada y sigue (`migrate.js:65-70`); cualquier otro error se
propaga, `server.js:118-121` lo atrapa, imprime el error y hace
`process.exit(1)`: **el backend no levanta el servidor HTTP con un
fallo de migracion sin resolver**. Hasta aqui, es un comportamiento
razonablemente seguro.

**Lo que no existe hoy es un candado independiente de esquema**: no
hay ninguna verificacion de "la base de datos tiene que estar en la
version X antes de que yo arranque" separada de la tabla de control.
Si alguien corre el backend contra una base de datos que esta en un
estado intermedio o inesperado por una razon distinta a "le faltan
migraciones" (por ejemplo, alguien edito una tabla a mano, o se
restauro un respaldo de una rama de codigo distinta), el backend no lo
detecta al arrancar: el primer sintoma seria una consulta SQL
fallando en tiempo de ejecucion contra el endpoint que use esa tabla o
columna, no un error claro al inicio.

**Que implicaria separar este paso**, si la politica de DGTIC no
permite que la aplicacion corra DDL por su cuenta: quitar la llamada a
`ejecutarMigraciones()` de `server.js:90` y dejar `npm run migrate`
como el unico mecanismo, invocado a mano o desde un paso de
despliegue/CI antes de arrancar el proceso nuevo. Esto no es un cambio
grande (es una funcion ya separada y ya expuesta como script de
`package.json`), pero cambia la operacion: alguien, o algun pipeline,
tiene que acordarse de correrlo antes de cada despliegue que incluya
una migracion nueva, porque el backend deja de hacerlo por su cuenta.
Esto no se implemento en este analisis, solo se describe.

## Parte 7. Lo demas para operar sin Docker

### Registros (logs)

El backend registra con `morgan('dev')` (`server.js:19,68`) mas
`console.log`/`console.error` sueltos en varios archivos. Todo va a la
salida estandar (`stdout`/`stderr`) del proceso Node, sin ningun
archivo de log ni rotacion configurada en el codigo. Hoy, Docker
captura esa salida (`docker logs pspp-backend`); nada en la aplicacion
la escribe a disco por su cuenta. Fuera de Docker, esos mismos logs se
perderian en la terminal a menos que el gestor de procesos (pm2,
systemd+journald) los redirija y rote por su cuenta; esto no esta
configurado en el repositorio, habria que resolverlo en el manual de
despliegue.

### Tareas en segundo plano

No hay ninguna libreria de cron (`backend/package.json` no tiene
`node-cron` ni equivalente) ni ningun proceso separado del servidor
web. Hay tres tareas periodicas, todas con `setInterval` dentro del
mismo proceso Node que atiende peticiones HTTP, arrancadas desde
`server.js:123-124`:

- Purga de proyectos eliminados hace mas de 30 dias: corre una vez al
  iniciar y luego cada 24 horas
  (`backend/src/utils/purgarProyectos.js:33-36`).
- Alertas de vencimiento de acciones: corre una vez al iniciar y luego
  cada 6 horas (`backend/src/utils/alertasVencimiento.js:88-95`).
- Limpieza de una cache en memoria del importador, cada 5 minutos
  (`backend/src/controllers/importar.controller.js:44-49`).

Ninguna necesita un proceso o servicio separado: viven dentro del
mismo proceso del backend, asi que donde sea que corra el backend,
corren ellas tambien. Aparte, las notificaciones en tiempo real usan
un `EventEmitter` en memoria (`backend/src/utils/sse.js`), explicito
en su propio comentario sobre que si algun dia el backend corre en
varias replicas, esto tendria que moverse a un mecanismo externo
(pub/sub) porque hoy solo funciona si hay un unico proceso.

### Salidas a internet que necesita el backend

**Ninguna**, en produccion. El correo de invitacion y de asignacion se
manda con la libreria `@emailjs/browser` **desde el navegador**, no
desde el backend (`frontend/src/utils/correoAsignacion.js`); el
backend solo entrega al frontend la configuracion de EmailJS (service
ID, template ID, llave publica), explicitamente documentado en el
propio codigo como no secreta porque EmailJS esta disenado para vivir
en el navegador (`backend/src/controllers/auth.controller.js:272-273`).
Las teselas del mapa (CARTO) tambien las pide el navegador
directamente, no el backend. No se encontro ninguna llamada HTTP de
`backend/src` hacia un host externo real (la unica coincidencia de
`axios`/`fetch`/`http` hacia afuera es un script de prueba local que
apunta a `localhost`). Esto simplifica la red que DGTIC tendria que
abrir: el backend solo necesita hablar con Postgres y con el
almacenamiento de archivos, nunca con internet.

### Supuestos sobre el sistema operativo

No se encontro ninguna llamada a `child_process` (`exec`, `spawn`,
`execSync`) en todo `backend/src`. No hay dependencias con
compilacion nativa (`bcryptjs` es JS puro, no la version nativa
`bcrypt`; no hay `sharp`, `canvas`, `sqlite3`). La generacion de
reportes en PDF es del lado del navegador con `jspdf`/`jspdf-autotable`
(`frontend/package.json:20-21`, `frontend/src/utils/generarReportePDF.js`);
el backend solo arma Excel/CSV con la libreria `xlsx`, tambien JS puro
(`backend/src/services/exportar.service.js`). No se encontraron rutas
de archivo fijas que asuman Linux mas alla del uso normal de
`path.join(__dirname, ...)` de Node. En conjunto: el backend no
necesita ningun paquete del sistema operativo instalado aparte del
propio Node.js.

La unica pieza que si depende de un binario del sistema es un script
de aprovisionamiento manual, no la aplicacion: `scripts/cargar-geo.sh`
necesita `ogr2ogr` (GDAL) o `shp2pgsql` en la maquina donde se corra,
para cargar los shapefiles de estados/municipios a PostGIS. Es un
paso que se corre una sola vez (o cuando cambia el catalogo
geografico), no en cada arranque.

### Version de Node y tiempo de build

Ni `backend/package.json` ni `frontend/package.json` declaran un
campo `engines`. Ambos Dockerfiles fijan `node:18-alpine`
(`backend/Dockerfile:3`, `frontend/Dockerfile:3`); ambos archivos se
llaman a si mismos "Dockerfile de desarrollo" en su primer comentario,
y son los mismos que usa `docker-compose.prod.yml` (no existe un
Dockerfile separado para produccion). El build del frontend es un
`vite build` estandar sin pasos de generacion de codigo ni datasets
grandes empaquetados (`frontend/vite.config.js`); no deberia ser
inusualmente lento para un proyecto de este tamano (alrededor de 260
archivos fuente), aunque no se corrio una medicion real en este
analisis.

## Parte 8. Tres escenarios con costos

### A. Todo fuera de Docker

- **Que instala y opera DGTIC**: PostgreSQL 15+ con PostGIS, el
  almacenamiento de archivos (MinIO nativo o un S3-compatible propio,
  o la variante de disco de la parte 3), Node.js con un gestor de
  procesos (pm2/systemd) para el backend, y su propio nginx u otro
  servidor web para el proxy y los estaticos, mas la terminacion de
  TLS en su propio front door.
- **Cambios de codigo**: ninguno obligatorio si consiguen un endpoint
  S3-compatible; si prefieren disco plano, los sitios de la parte 3.
  Fuera de eso, cero: todo ya lee configuracion de variables de
  entorno.
- **Riesgos**: recrear a mano el aislamiento de red que Docker daba
  gratis (firewalls explicitos entre capas); perder `restart: always`
  y los healthchecks, hay que replicarlos; reescribir
  `scripts/backup.sh` (usa `docker exec`/`docker run --volumes-from`
  en sus dos pasos principales); PostGIS puede ser una instalacion
  nueva para DGTIC; sin una imagen inmutable de respaldo, la
  reproducibilidad depende integramente de que el manual se siga al
  pie de la letra.
- **Manual de despliegue**: el mas largo de escribir de los tres, pero
  tambien el que mas se parece a como un equipo de operaciones
  tradicional ya trabaja.

### B. Mixta

- **Lo que sale sin costo de codigo**: backend, nginx y frontend-build
  (los tres de dificultad Baja o Trivial en la parte 1), y GeoServer
  se retira por completo en vez de migrarse.
- **Lo que puede quedarse en contenedor, al menos para empezar**:
  Postgres+PostGIS y/o MinIO, si DGTIC todavia no quiere operar alguno
  de los dos de forma nativa.
- **Cambios de codigo**: ninguno, en cualquier combinacion.
- **Riesgos**: menores que el escenario A, porque las dos piezas con
  estado que de verdad duele mal-operar (una base de datos, un
  almacen de archivos) siguen en una imagen conocida mientras se
  resuelve; el riesgo se concentra en la integracion entre lo que
  esta dentro y fuera de contenedor (red, puertos, firewalls).
- **Manual de despliegue**: intermedio: mas corto que A porque una o
  dos piezas siguen siendo "docker compose up", pero ya no es un solo
  comando para todo.

### C. Como esta hoy

- **Que instala y opera DGTIC**: Docker Engine y `docker compose` (v2),
  nada mas a nivel de sistema operativo.
- **Cambios de codigo**: ninguno.
- **Riesgos**: el que ya expreso DGTIC no es tecnico sino
  organizacional (estan centralizando servicios y no quieren mas
  piezas en Docker). Riesgo tecnico real que existe hoy,
  independiente de que escenario se elija: `minio/minio:latest` y
  `nginx:alpine` son etiquetas flotantes, no fijadas a una version
  exacta.
- **Manual de despliegue**: el mas corto y el mas facil de mantener
  reproducible (la imagen es la unidad de reproducibilidad), pero es
  exactamente lo que DGTIC dijo que prefiere evitar.

### Recomendacion

El criterio que importa aqui no es cual es tecnicamente superior, es
cual puede operar y respaldar el equipo de DGTIC. Por eso se
recomienda el **escenario B**: sacar backend, nginx y frontend-build
ya mismo, sin tocar una linea de codigo y sin riesgo tecnico nuevo;
retirar GeoServer del despliegue por completo, porque no se usa; y
dejar la decision sobre Postgres y MinIO para la reunion con DGTIC
(parte 9), segun lo que ya operen. Sacarlos tambien, el dia que
DGTIC lo decida, cuesta exactamente lo mismo que sacar el backend: no
hay cambios de codigo pendientes esperando por ellos, salvo que se
elija la variante de disco para los archivos (parte 3), que es un
cambio acotado y ya detallado por archivo y linea.

## Parte 9. Preguntas para la reunion con DGTIC

1. ¿Que version de PostgreSQL tienen instalada o pueden instalar, y es
   la 15.x o superior?
2. ¿Ya tienen PostGIS instalado en alguna instancia de Postgres, o
   seria la primera vez que lo instalan?
3. ¿Ya operan algun almacenamiento compatible con S3 (propio o en la
   nube) donde PSPP pudiera guardar sus archivos en vez de MinIO, o
   prefieren que MinIO siga siendo el almacenamiento, solo fuera de
   Docker?
4. ¿Que servidor web o proxy inverso usan institucionalmente (nginx,
   Apache, IIS, algo propio)? ¿Van a terminar TLS ellos mismos, o
   esperan que PSPP les entregue algo que ya hable HTTPS
   directamente?
5. ¿Corren Java en su infraestructura? Relevante solo si en algun
   momento quisieran retomar GeoServer, que hoy se recomienda no
   entregar porque no se usa.
6. ¿Que gestor de procesos usan para aplicaciones Node.js o
   equivalentes (pm2, systemd, supervisord, algo propio de su
   plataforma)?
7. ¿Tienen ya un esquema de firewall/segmentacion de red definido
   entre "la aplicacion" y "la base de datos", o hay que proponerlo
   desde PSPP?
8. ¿Con que herramienta y periodicidad corren sus respaldos
   institucionales, para saber si conviene adaptar
   `scripts/backup.sh` a su esquema o sustituirlo por el de ellos?
9. ¿A que version de Node.js le dan soporte (18 ya no tiene soporte
   oficial; 20 y 22 son LTS vigentes)?
10. Sobre migraciones automaticas (parte 6): ¿su politica prohibe que
    la aplicacion corra cambios de esquema por su cuenta contra una
    base de datos administrada, o solo exige que sea un paso visible
    y aprobado, no necesariamente manual?
11. ¿Ya tienen dominio y certificado para donde va a vivir esto?
    Afecta directamente a `FRONTEND_URL`, la lista blanca de CORS, y
    las ligas de activacion de cuenta que genera el backend.
