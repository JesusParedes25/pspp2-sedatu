# API de indicadores — guía para quien construye el tablero externo

Esta API expone el avance de los indicadores de PSPP v2.0 para que otra
plataforma (el tablero ejecutivo de la Secretaría) los consuma. Es de
**solo lectura**: la plataforma externa consulta, nunca escribe. Esta guía
está escrita para quien programa ese consumo y no conoce PSPP por dentro.

## Autenticación

```
GET /api/v1/publico/indicadores
Authorization: Bearer <token>
```

También se acepta el encabezado `X-API-Key: <token>` en vez de
`Authorization: Bearer`, para herramientas de tablero que solo permiten
configurar un encabezado fijo.

El token se da de alta, rota o revoca desde **Administración > API** en la
plataforma (solo superadmin). Se muestra **una sola vez**, al crearlo: la
base de datos solo guarda su huella (hash), nunca el valor en claro — ni el
propio panel de administración puede recuperarlo después. Si se pierde, se
revoca y se emite uno nuevo.

Sin un token válido la API responde `401` con `codigo: "TOKEN_REQUERIDO"` o
`"TOKEN_INVALIDO"` (no distingue "no existe" de "revocado": a quien no
tiene una credencial válida no se le da información sobre cuáles sí lo
son).

## Lo más importante antes de integrar: la meta es acumulada, no anual

`meta`, `meta_total` y todo lo que derive de ellos (`porcentaje`,
`suma_metas` por dependencia) son la meta **global** del indicador, de
principio a fin del proyecto — nunca "la meta de este ejercicio fiscal".
La plataforma todavía no captura metas por año (existe la tabla para
hacerlo en el futuro, pero está vacía hoy): no hay ningún campo en esta
API que represente "cuánto se prometió para 2026" en particular. **No
compares estos números contra un presupuesto o una meta anual** — el
resultado sería un porcentaje sin sentido. Si necesitas evolución en el
tiempo, usa `periodos` (ver más abajo), que sí reporta por mes/año, pero
sigue siendo "cuánto se ha movido", no "cuánto se prometió para ese año".

## Dos identificadores, para dos cosas distintas

| Campo | Para qué sirve | ¿Puede cambiar? |
|---|---|---|
| `id` | El UUID real del indicador en el catálogo. **Es la llave que debes guardar si necesitas una referencia estable en tu propia base de datos.** | No, nunca — un UUID no se reescribe. |
| `clave` | Un identificador legible para humanos (ej. `viviendas-mejoradas-zm`), pensado para leer en logs o URLs, no para máquinas. | No: aunque alguien edite el nombre del indicador en el catálogo, `clave` no se regenera — queda congelada desde que se crea (`CAMPOS_EDITABLES` en `backend/src/db/queries/catalogo-indicadores.queries.js` nunca incluye `clave` entre lo que `actualizar()` puede tocar). |

Antes de esta versión, `clave` era el único identificador disponible. Ya
era estable (confirmado arriba), pero como es un slug derivado del nombre
y truncado a 70 caracteres, dos nombres distintos muy parecidos en sus
primeros 70 caracteres pueden truncar al mismo slug — el importador le
agrega un sufijo numérico en ese caso, por orden de llegada, no por
ningún criterio semántico. Usa `id` para tus propias referencias; usa
`clave` solo como etiqueta legible.

## Cambio de comportamiento por omisión (importante si ya integraste esta API antes)

Hasta ahora, sin ningún parámetro, esta API devolvía el catálogo
institucional completo (alrededor de 1400 indicadores), la enorme mayoría
sin ningún proyecto que los mida — totales en cero, puro ruido para
graficar. **Sin parámetros, solo se devuelven los indicadores con al
menos un proyecto vinculado** (hoy, decenas, no miles). Si tu integración
ya filtraba `proyectos: []` por su cuenta, puedes quitar ese filtro; si
necesitas el catálogo completo tal como antes (incluido lo que ningún
proyecto mide), agrega `?todos=1`.

Este filtro es solo por proyecto, **no por `activo`**: un indicador que
ya tiene captura real sigue apareciendo aunque se retire del catálogo
(deje de ofrecerse para proyectos nuevos) — ver el campo `activo` abajo.

## Parámetros

| Parámetro | Para qué | Default |
|---|---|---|
| `clave` | Pedir un solo indicador por su clave estable, en vez del listado general. Siempre se devuelve si existe, tenga o no proyectos y esté o no activo en el catálogo — es una consulta puntual, no pasa por el filtro de abajo. Ej. `?clave=viviendas-mejoradas` | (ninguno) |
| `todos` | `?todos=1` quita el filtro por omisión: devuelve también lo que ningún proyecto mide. | sin este parámetro, solo lo que algún proyecto mide |
| `dg` | Solo los proyectos liderados por esta Dirección General (por sus siglas exactas, ej. `?dg=DGOTU`). Un indicador medido por varias DGs sigue apareciendo, pero con `proyectos`/`nodos`/`por_dependencia` acotados a esa DG. | (ninguno) |
| `instrumento` | Solo los indicadores de este instrumento institucional (ej. `?instrumento=PSEDATU 2025-2030`). Ver `instrumento` abajo. | (ninguno) |
| `cve_ent` | Solo los nodos (ver `nodos` abajo) cuyo territorio efectivo caiga en esta entidad, por su clave INEGI de 2 dígitos (ej. `?cve_ent=14` para Jalisco). **No quita indicadores ni proyectos** — recorta el arreglo `nodos` de cada proyecto; si un proyecto no tiene ningún nodo en esa entidad, su `nodos` queda vacío pero el proyecto sigue en la respuesta. | (ninguno) |
| `historico_limite` | Cuántos puntos recientes trae `historico` por proyecto, como máximo. | `60` (tope absoluto: `365`) |

Todos los filtros de fila (`clave`, `dg`, `instrumento`) se combinan entre
sí con AND. `cve_ent` es distinto a propósito: territorio vive en el
nodo, no en el indicador ni en el proyecto, así que filtrar por él nunca
hace desaparecer un indicador o un proyecto completo.

`historico` siempre trae los puntos **más recientes**, nunca una página
intermedia. Si necesitas el historial completo más allá del tope, pídelo
explícitamente con un `historico_limite` más alto (hasta 365).

## Forma de la respuesta

```json
{
  "generado_en": "2026-10-28T19:40:00.000Z",
  "total": 1,
  "datos": [
    {
      "id": "3f8a1e4c-9b2d-4a6e-8c1f-2d7b9e5a0c33",
      "clave": "personas-capacitadas-ran",
      "nombre": "Número de personas capacitadas",
      "descripcion": "...",
      "tipo": "Avance_fisico",
      "unidad": "Numero",
      "etiqueta_unidad": "personas",
      "definicion": "Cómo se mide exactamente...",
      "fuente": "Padrón único de beneficiarios",
      "fuente_oficial": "Sección Anexo Estadístico Indicadores del Plan Nacional de Desarrollo 2025-2030, Eje General 2, página 261",
      "activo": true,
      "instrumento": "PSEDATU 2025-2030",
      "categoria": "Fortalecer la certeza jurídica agraria",
      "objetivo": "4",
      "estrategia": "4.7",
      "linea": "4.7.9",
      "area_responsable": ["RAN", "UAJ"],
      "origen": "institucional",
      "sumable": true,
      "meta_total": 5000,
      "avance_total": 1250,
      "porcentaje": 25.0,
      "por_dependencia": [
        {
          "siglas": "DGOTU",
          "suma_metas": 3000,
          "suma_avances": 800,
          "num_proyectos": 1,
          "fecha_corte_mas_reciente": "2026-10-10"
        },
        {
          "siglas": "RAN",
          "suma_metas": 2000,
          "suma_avances": 450,
          "num_proyectos": 1,
          "fecha_corte_mas_reciente": "2026-09-20"
        }
      ],
      "proyectos": [
        {
          "proyecto_id": "a1b2c3d4-0000-0000-0000-000000000001",
          "proyecto": "Mejoramiento de vivienda ZM Guadalajara",
          "estado": "En_proceso",
          "dg": "DGOTU",
          "meta": 3000,
          "avance": 800,
          "ultima_captura_por": "Beto Capturista",
          "actualizado_en": "2026-10-15T14:22:00.000Z",
          "fecha_corte": "2026-10-10",
          "historico": [
            { "fecha": "2026-08-01", "movimiento": 300, "acumulado": 300, "nodo_id": "acc-001", "registrado_por": "Ana Reportera" },
            { "fecha": "2026-10-10", "movimiento": 3, "acumulado": 303, "nodo_id": "tar-014", "registrado_por": "Beto Capturista" },
            { "fecha": "2026-10-10", "movimiento": 497, "acumulado": 800, "nodo_id": null, "registrado_por": "Beto Capturista" }
          ],
          "periodos": [
            { "periodo": "2026-08", "anio": 2026, "movimiento": 300, "acumulado_al_cierre": 300 },
            { "periodo": "2026-10", "anio": 2026, "movimiento": 500, "acumulado_al_cierre": 800 }
          ],
          "nodos": [
            {
              "nodo_id": "acc-001",
              "nombre": "Capacitación a comisariados ejidales",
              "tipo": "Accion",
              "estado": "Completada",
              "aportacion_declarada": 300,
              "modo": "manual",
              "aportado": 300,
              "fecha_aporte": "2026-08-01",
              "territorio_propio": {
                "entidad": { "cve_ent": "14", "nombre": "JALISCO" },
                "municipios": [{ "cve_mun": "14039", "nombre": "Guadalajara" }]
              },
              "territorio_efectivo": {
                "entidad": { "cve_ent": "14", "nombre": "JALISCO" },
                "municipios": [{ "cve_mun": "14039", "nombre": "Guadalajara" }]
              }
            },
            {
              "nodo_id": "tar-014",
              "nombre": "Taller de certeza jurídica, segunda ronda",
              "tipo": "Tarea",
              "estado": "En_proceso",
              "aportacion_declarada": 20,
              "modo": "automatico",
              "aportado": 3,
              "fecha_aporte": "2026-10-10",
              "territorio_propio": { "entidad": null, "municipios": [] },
              "territorio_efectivo": {
                "entidad": { "cve_ent": "14", "nombre": "JALISCO" },
                "municipios": []
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Nivel indicador (uno por cada `clave` del catálogo)

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string (UUID) | Identificador estable para tus propias referencias. Ver la sección de arriba. |
| `clave` | string | Identificador legible, estable, pero no pensado para colisiones garantizadas (ver arriba). |
| `nombre`, `descripcion`, `tipo` | string | La definición del indicador tal como vive en el catálogo. |
| `unidad` | string | `Porcentaje`, `Moneda_MXN` o `Numero`. Determina `sumable` — ver abajo. |
| `etiqueta_unidad` | string o `null` | Para `Numero`: qué se cuenta (ej. "viviendas", "personas"). Vacío para `Porcentaje`/`Moneda_MXN`. |
| `definicion`, `fuente` | string o `null` | Cómo se mide y de dónde sale el dato, en texto libre capturado en el catálogo. Pueden venir `null` cuando el catálogo solo tenía ahí una nota de mantenimiento interna, nunca pensada para salir de la plataforma — esta API ya la filtra, nunca te llega esa nota. |
| `fuente_oficial` | string o `null` | La referencia documental institucional de origen (ej. "Sección Anexo Estadístico... página 261"). Distinta de `fuente`: `fuente` es de dónde sale el dato operativo (un padrón, un sistema); `fuente_oficial` es el documento de planeación que define el indicador. `null` para un indicador dado de alta en la plataforma, que no viene de ningún documento institucional. |
| `activo` | boolean | Si el indicador sigue vigente en el catálogo (se sigue ofreciendo para proyectos nuevos). **Esta API nunca filtra por este campo**: uno retirado puede venir en `false` y seguir apareciendo con su captura real. |
| `instrumento` | string o `null` | El instrumento de planeación de origen (ej. `"PSEDATU 2025-2030"`, `"Informe de Gobierno"`). `null` si el indicador se creó dentro de la plataforma, no a partir de un documento institucional — ver `origen`. |
| `categoria` | string o `null` | La categoría/producto institucional al que pertenece este indicador dentro de su instrumento. |
| `objetivo`, `estrategia`, `linea` | string o `null` | Solo para indicadores del instrumento PSEDATU: el código jerárquico de la línea de acción, partido en sus tres niveles (ej. código `"4.7.9"` da `objetivo: "4"`, `estrategia: "4.7"`, `linea: "4.7.9"`). `null` en los demás instrumentos, que no usan este código. |
| `area_responsable` | arreglo de string | Las siglas de la(s) Unidad(es) Responsable(s) que reportan este indicador. Casi siempre tiene un elemento; puede tener varios cuando más de una UR comparte el mismo indicador institucional (ej. `["RAN", "UAJ"]`). Nunca `null`: si no hay ninguna capturada, es `[]`. |
| `origen` | string | `"institucional"` si viene de un instrumento de planeación (`instrumento` no es `null`); `"plataforma"` si lo dio de alta un usuario dentro de PSPP. Mismo criterio que el filtro "De la plataforma" del catálogo interno. |
| `sumable` | boolean | `false` cuando `unidad` es `"Porcentaje"` — sumar porcentajes de proyectos distintos no da un número con significado (40% + 60% no son "100%" de nada real). Cuando es `false`, **`meta_total`, `avance_total` y `porcentaje` vienen en `null` a propósito**, igual que `suma_metas`/`suma_avances` dentro de cada entrada de `por_dependencia`: no hay una cifra agregada válida que esta API pueda ofrecerte. En ese caso, lee `meta`/`avance` dentro de cada proyecto por separado — eso sigue siendo válido, cada proyecto sí tiene su propio porcentaje real. |
| `meta_total`, `avance_total` | number o `null` | Suma de la meta y el avance de **todos** los proyectos que lo miden. `null` cuando `sumable` es `false` (ver arriba). |
| `porcentaje` | number o `null` | `avance_total / meta_total * 100`, redondeado a un decimal. `null` si `sumable` es `false`, o si no hay meta capturada en ningún proyecto. **Sin tope**: un indicador sobre-cumplido reporta más de 100 a propósito. |
| `por_dependencia` | arreglo | Una entrada por cada Dirección General que lidera al menos un proyecto que mide este indicador — ver tabla propia abajo. |
| `proyectos` | arreglo | Uno por cada proyecto que mide este indicador — ver tabla propia abajo. Puede venir `[]` si el indicador todavía no lo usa ningún proyecto (solo llega así con `?todos=1` o `?clave=`). |

### `por_dependencia` (uno por Dirección General)

| Campo | Significado |
|---|---|
| `siglas` | La Dirección General. |
| `suma_metas`, `suma_avances` | Meta y avance sumados de **solo los proyectos de esta DG** que miden el indicador (cuadra exacto con filtrar `proyectos` por `dg` y sumar a mano). `null` si `sumable` es `false` a nivel del indicador. |
| `num_proyectos` | Cuántos proyectos de esta DG miden el indicador. |
| `fecha_corte_mas_reciente` | La `fecha_corte` más reciente entre los proyectos de esta DG. `null` si ninguno tiene movimientos todavía. |

### Nivel proyecto (uno por cada proyecto que mide ese indicador)

| Campo | Significado |
|---|---|
| `proyecto_id`, `proyecto`, `estado`, `dg` | El proyecto dueño de este avance y su Dirección General líder. |
| `meta`, `avance` | La meta y el avance de **este proyecto en particular** (no el agregado). Siguen siendo válidos aunque `sumable` sea `false` a nivel del indicador — lo que no es válido es sumarlos entre proyectos. |
| `ultima_captura_por` | Quién registró el movimiento más reciente de este proyecto (no necesariamente quien lo creó: distintas personas pueden capturar avances a lo largo del tiempo, en nodos distintos — este campo es solo el más reciente). |
| `actualizado_en` | **Fecha del registro, no del dato.** Es `updated_at` de la fila del indicador — se mueve con cualquier edición (renombrar, cambiar la meta, re-vincular el catálogo), no solo con una captura de avance. Para "¿a qué fecha corresponde este número?" usa `fecha_corte`. |
| `fecha_corte` | Fecha del movimiento de avance más reciente (no anulado) de todo el proyecto para este indicador. `null` si todavía no tiene ningún movimiento. |
| `historico` | Arreglo de movimientos individuales, ordenado de más antiguo a más reciente — ver tabla propia abajo. Puede venir vacío (`[]`). |
| `periodos` | Arreglo con un resumen por mes calendario — ver tabla propia abajo. Puede venir vacío (`[]`). |
| `nodos` | Arreglo con cada etapa/acción/tarea que aporta a este indicador dentro de este proyecto, y su territorio — ver tabla propia abajo. Puede venir vacío (`[]`) si el indicador está vinculado al proyecto pero a ningún nodo específico todavía. |

### `historico` (un movimiento real por entrada — ya no agrupado por día)

| Campo | Significado |
|---|---|
| `fecha` | Fecha del movimiento (solo fecha, sin hora). |
| `movimiento` | Cuánto cambió el valor **en este movimiento particular**. Puede ser negativo (una corrección hacia abajo). |
| `acumulado` | El valor acumulado del indicador **después** de aplicar este movimiento — equivalente a lo que esta API entregaba antes como `valor` en cada punto de `historico`. |
| `nodo_id` | El `nodo_id` (ver `nodos` abajo) de donde vino este movimiento, si vino de una etapa/acción/tarea vinculada. `null` si fue un ajuste manual sin nodo de origen. |
| `registrado_por` | Quién lo registró. |

**Importante:** dos movimientos pueden caer el mismo día (ej. una acción se
marca Completada aportando +3 y, el mismo día, alguien hace un ajuste
manual de +1) — antes esta API los entregaba ya sumados en una sola
entrada de `historico`, y no había forma de saber desde la respuesta que
habían sido dos eventos distintos de dos orígenes distintos. Ahora cada
movimiento real es su propia entrada: si necesitas "el acumulado al cierre
de tal fecha", usa el último `acumulado` de ese día; si necesitas "cuánto
se movió esa fecha en total", suma los `movimiento` de ese día, o usa
`periodos` si te basta con granularidad mensual.

### `periodos` (un resumen por mes calendario)

| Campo | Significado |
|---|---|
| `periodo` | Mes y año en formato `"YYYY-MM"` (ej. `"2026-10"`). |
| `anio` | El año, ya como número — para filtrar por ejercicio fiscal sin tener que parsear `periodo`. **Recuerda la advertencia de arriba:** esto te dice en qué año se registró el movimiento, no que la meta de ese indicador esté definida por año — sigue sin haber una "meta 2026" en esta API. |
| `movimiento` | Suma de todos los `movimiento` de `historico` que caen en ese mes. |
| `acumulado_al_cierre` | El `acumulado` del último movimiento de ese mes — "cuánto llevaba el indicador al cierre de ese mes". |

### `nodos` (qué etapa/acción/tarea aporta, y desde dónde)

| Campo | Significado |
|---|---|
| `nodo_id` | UUID de la etapa, acción o tarea. Es el mismo valor que puede aparecer como `nodo_id` dentro de `historico`. |
| `nombre`, `estado` | Nombre y estado actual del nodo dentro de PSPP. |
| `tipo` | `"Etapa"`, `"Accion"` o `"Tarea"`. |
| `aportacion_declarada` | Cuánto se configuró que este nodo aporta al indicador (lo que un usuario capturó al vincularlo). |
| `modo` | `"manual"`: el nodo aporta su valor completo solo al marcarse Completada, nada antes. `"automatico"`: aporta proporcional a su propio avance, conforme éste sube. |
| `aportado` | Cuánto ha aportado realmente este nodo hasta ahora (suma de sus propios movimientos, no la declaración — puede ser menor a `aportacion_declarada` si el nodo no ha concluido o no ha avanzado del todo). |
| `fecha_aporte` | Fecha del aporte más reciente de este nodo en particular. `null` si todavía no ha aportado nada. Puede ser distinta de `fecha_corte` del proyecto (que es la más reciente **entre todos los nodos**). |
| `territorio_propio` | El territorio capturado directamente en este nodo — ver forma abajo. Vacío si este nodo específico nunca tuvo territorio capturado. |
| `territorio_efectivo` | El territorio que aplica después de heredar del nodo padre cuando el propio está vacío: una tarea sin territorio hereda de su acción (y si esa acción es una subacción sin territorio propio, de la acción padre, y de ahí de la etapa); una acción sin territorio hereda de su etapa. Una etapa nunca hereda — es el nivel más alto con territorio en este esquema, así que para una etapa `territorio_efectivo` es siempre igual a `territorio_propio`. Esta herencia es una herencia **en vivo**, calculada al responder; dentro de la plataforma, el nodo hijo también recibe una copia de esos datos al crearse (si no captura los suyos), así que en la práctica suelen coincidir — pero si el territorio del padre cambió después de que el hijo se creó, `territorio_efectivo` sí refleja ese cambio y `territorio_propio` del hijo (vacío) no. |

Forma de `territorio_propio` / `territorio_efectivo` (nunca se omite, aunque esté vacío):

```json
{ "entidad": null, "municipios": [] }
```
o, con datos:
```json
{
  "entidad": { "cve_ent": "14", "nombre": "JALISCO" },
  "municipios": [{ "cve_mun": "14039", "nombre": "Guadalajara" }]
}
```

`cve_ent` (2 dígitos) y `cve_mun` (5 dígitos) son claves oficiales del
catálogo del INEGI, no un identificador interno de PSPP — puedes usarlas
directo para cruzar contra cualquier otro dato georreferenciado por INEGI.
Un nodo puede tener entidad sin ningún municipio capturado todavía
(`municipios: []` con `entidad` presente); nunca al revés.

## Cómo leer esta respuesta, paso a paso

1. **¿Cuánto lleva el indicador en total?** Si `sumable` es `true`, usa
   `avance_total`/`meta_total`/`porcentaje` a nivel indicador. Si es
   `false` (indicadores en `Porcentaje`), no hay un total válido — suma tú
   mismo solo lo que tenga sentido para tu caso, leyendo `proyectos[]`.
2. **¿Cómo se reparte entre Direcciones Generales?** Usa `por_dependencia`
   directo — ya viene resuelto, no hace falta que agrupes `proyectos` por
   `dg` a mano (aunque si lo haces, debe cuadrar exacto).
3. **¿Cómo amarro una cifra a un lugar del país?** Entra a
   `proyectos[].nodos[]`: cada nodo tiene `aportado` (cuánto realmente
   contribuyó) y `territorio_efectivo` (dónde). Si necesitas acotar por
   entidad desde el servidor en vez de filtrar tú del lado del cliente,
   usa `?cve_ent=`.
4. **¿Cómo armo una serie de tiempo?** Para granularidad fina, usa
   `historico` (un punto por movimiento real). Para una gráfica mensual o
   para comparar entre años, usa `periodos`, que ya viene agregado por mes
   con `anio` aparte.
5. **¿Qué llave uso si voy a guardar una referencia a este indicador en mi
   propia base?** `id` (el UUID), nunca `clave` ni `nombre`.

## Probar la API sin escribir código

En **Administración > API** hay un probador: eliges un indicador (o lo
dejas vacío para el catálogo completo) y ejecutas la consulta real. Esa
prueba corre con la sesión del administrador que la usa, **no con un
token real** — como se explicó arriba, el token nunca se puede recuperar
una vez creado. El botón "Copiar comando curl" junto al probador genera el
comando exacto (con `<token>` como marcador, a reemplazar por un token real
ya emitido) para probarlo desde una terminal o mandárselo a quien
desarrolla el tablero.

## Notas sueltas para quien construye el consumidor

- Todas las fechas van en UTC, formato ISO 8601 (las fechas "solo fecha",
  como `fecha_corte`, van sin hora: `"2026-10-10"`).
- Un indicador del catálogo que ningún proyecto usa todavía aparece igual
  con `?todos=1` o `?clave=`, con `proyectos: []` y los totales en cero —
  así se conoce el universo completo del catálogo, no solo lo que ya
  tiene datos.
- Esta API nunca borra históricamente nada que ya se haya capturado: un
  valor corregido queda como un movimiento nuevo en `historico`, no como
  una reescritura silenciosa del anterior.
- Un nodo sin territorio capturado en ningún nivel siempre devuelve
  `{ "entidad": null, "municipios": [] }`, nunca omite el campo — puedes
  asumir siempre que `territorio_propio`/`territorio_efectivo` existen en
  cada entrada de `nodos`.
