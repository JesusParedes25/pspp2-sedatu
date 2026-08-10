# PSPP v2.0 — Contexto para Claude Code

Plataforma de Seguimiento de Proyectos Prioritarios, SEDATU (secretaría
federal mexicana de ordenamiento territorial). Uso interno.

## Stack

- **Frontend**: React 18 + Vite 5 + Tailwind, React Router v6, `@xyflow/react`
  v12 (lienzo de Diagrama), `d3-hierarchy`. Carpeta `frontend/`.
- **Backend**: Node/Express, **SQL crudo vía `pg`, sin ORM**. Carpeta `backend/`.
- **Base de datos**: PostgreSQL + PostGIS.
- **Archivos**: MinIO. **Mapas**: GeoServer (WMS/WFS).
- Migraciones en `backend/src/db/migrations/`, numeradas secuencialmente
  (`NNN_descripcion.sql`). Estilo idempotente establecido: bloques
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns ...) THEN ALTER TABLE ... END IF; END$$;`
  — ver `024_avance_semaforo_override.sql` como referencia de estilo antes
  de escribir una migración nueva. Se corren con `npm run migrate`
  (`backend/src/db/migrate.js`).

## Entornos

- **Local (dev)**: `docker compose up` (archivo `docker-compose.yml`),
  contenedores `pspp_backend`/`pspp_postgres`/`pspp_frontend`/etc.
  Backend con bind-mount + `nodemon` (hot reload). El backend en dev
  **reseedea la base de datos en cada arranque del contenedor** (ver
  logs "Seeders completados") — los UUIDs de proyectos/nodos semilla
  **cambian en cada restart**, no asumir que un ID de una sesión anterior
  sigue existiendo.
- **Producción**: servidor `srv885729` (SSH), dominio `daot.geobint.com`
  vía Nginx Proxy Manager. Se despliega con `docker-compose.prod.yml`.
  Repo en el servidor: `~/pspp2-sedatu`.
- Usar siempre `docker compose` (v2), **no** `docker-compose` (v1) — hay
  un mismatch de versión de API con el Docker Engine del servidor.

## Desplegar a producción (checklist)

`docker-compose.prod.yml` **hornea el código dentro de la imagen al
buildear** — ni el frontend ni el backend usan bind-mount en prod (a
diferencia de dev). Por eso cualquier cambio de código, no solo de
config, requiere reconstruir la imagen correspondiente:

```bash
cd ~/pspp2-sedatu
git pull

# Si cambió código de backend (controllers, queries, etc.):
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend

# Si hay una migración nueva:
docker compose -f docker-compose.prod.yml exec backend npm run migrate

# Si cambió código de frontend:
docker compose -f docker-compose.prod.yml build frontend-build
docker compose -f docker-compose.prod.yml up -d frontend-build
# (frontend-build es un contenedor de un solo uso: compila con `npm run
# build` y copia dist/ al volumen compartido `frontend_build`, que nginx
# sirve de solo lectura — no necesita quedar corriendo)

# SIEMPRE que se reconstruya/recree "backend":
docker compose -f docker-compose.prod.yml restart nginx
```

**Por qué el `restart nginx` es obligatorio y se olvida fácil**:
`nginx/default.conf` usa `proxy_pass http://backend:3000;` con el nombre
del servicio directo (sin variable + `resolver`), así que nginx resuelve
ese hostname a una IP **una sola vez al arrancar** y la cachea. Cuando se
recrea el contenedor `backend` (nueva imagen, nueva IP interna en la red
de Docker), nginx se queda apuntando a la IP vieja → **502 en todo
`/api/`** hasta reiniciarlo. `nginx`/`postgres`/`minio`/`geoserver` nunca
necesitan rebuild, solo restart si dependen de algo que cambió.

## Convenciones de layout aprendidas esta sesión (no repetir los mismos errores)

- **La app usa scroll de página normal, NO paneles de viewport fijo.**
  Se intentó una vez acotar el shell (`Layout.jsx`) a `h-screen
  overflow-hidden` con paneles internos de scroll independiente — el
  usuario lo rechazó explícitamente por sentirse "rígido"/"encapsulado
  en un rectángulo" comparado con una página que fluye. `Layout.jsx` usa
  `min-h-screen` (no `h-screen`), sin `overflow-hidden`. No reintroducir
  ese patrón sin que se pida explícitamente.
- **Alturas de contenedores**: los componentes que necesitan una altura
  explícita porque envuelven una librería de canvas/mapa (`ReactFlow` en
  Diagrama, Leaflet en `MapaProyecto`) usan un **valor fijo en px**
  (`height: 650`, `height: 440`) — no medido con JS, no calculado contra
  el viewport. Los componentes sin librería de canvas (Detalle/árbol,
  Vista lista, Cronograma) **no fijan altura en absoluto** — el
  contenido decide, igual que cualquier sección más de la página. Esto
  costó varias iteraciones (incluyendo un hook `useAlturaHastaFinal`
  creado y luego eliminado dos veces) — no reinventar una "altura
  medida contra el viewport", el criterio ya decidido es el de arriba.
- **Gotcha de flexbox**: `min-h-0`/`min-w-0` en hijos flex es necesario
  para que `overflow-auto` funcione y para truncar texto — apareció más
  de una vez.

## Arquitectura / convenciones del dominio

- **Jerarquía**: Proyecto → Etapa → Acción → Tarea. Etapas/Acciones
  pueden ser contenedores (avance calculado de hijos) u hojas (avance
  editable directo) — ver `avance_actual`/`avance_override`/
  `semaforo_override` (migración 024) para el patrón "valor calculado
  con override manual opcional", reutilizado luego para el campo
  `estatus_cualitativo`.
- **Stream de actividad unificado**: tabla `actividad` (migración 039,
  `backend/src/db/queries/actividad.queries.js`) — registro cronológico
  por nodo (etapa/acción/tarea) de comentarios, archivos, riesgos y
  cambios de estatus/avance/estatus-cualitativo. Para cualquier feature
  nueva que necesite un historial con fecha+autor, reusar
  `actividadQueries.crearActividad({tipoNodo, idNodo, tipoEvento, ...})`
  en vez de crear una tabla nueva — `tipoEvento` debe agregarse al CHECK
  de la columna (`VARCHAR(20)`, cuidado con el límite de caracteres).
- **Permisos**: única fuente de verdad es
  `backend/src/utils/autorizacion.js` — basado en `proyecto_usuarios`
  (rol responsable/colaborador) + `proyectos.id_creador` + rol global del
  usuario (superadmin/ejecutivo). **No** depende de la DG del usuario.
- **DGs (Direcciones Generales) de un proyecto**: se calculan
  automáticamente (`obtenerDGsProyecto` en
  `backend/src/db/queries/proyectos.queries.js`) a partir de quién es
  responsable o colaborador de cualquier parte del proyecto — la tabla
  `proyecto_dgs` y las funciones `agregarDG`/`eliminarDG` quedaron sin
  usarse (no hay UI que las llame), no reactivar ese patrón de curación
  manual.

## Estado reciente (agosto 2026)

Sesión reciente cubrió: rediseño de layout de Seguimiento/Detalle
(altura, scroll, orden de subpestañas — ver puntos de arriba), feature
de "estatus cualitativo" (nota corta por nodo, migración 047), y el fix
de detección automática de DGs. Para detalle de cualquiera de estos,
`git log --oneline` tiene mensajes de commit largos y explicativos — es
más confiable que este archivo para el detalle exacto de qué cambió y
por qué, este archivo es solo para no repetir decisiones/errores ya
resueltos.
