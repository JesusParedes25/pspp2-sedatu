# API de indicadores — guía para quien construye el tablero externo

Esta API expone el avance de los indicadores de PSPP v2.0 para que otra
plataforma (el tablero ejecutivo) los consuma. Es de **solo lectura**: la
plataforma externa consulta, nunca escribe.

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

## Cambio de comportamiento por omisión (importante si ya integraste esta API antes)

Hasta ahora, sin ningún parámetro, esta API devolvía el catálogo
institucional completo (alrededor de 1400 indicadores), la enorme mayoría
sin ningún proyecto que los mida — totales en cero, puro ruido para
graficar. **Desde esta versión, sin parámetros, solo se devuelven los
indicadores activos en el catálogo y con al menos un proyecto vinculado**
(hoy, decenas, no miles). Si tu integración ya filtraba `proyectos: []`
por su cuenta, puedes quitar ese filtro; si necesitas el catálogo completo
tal como antes, agrega `?todos=1`.

## Parámetros

| Parámetro | Para qué | Default |
|---|---|---|
| `clave` | Pedir un solo indicador por su clave estable, en vez del listado general. Siempre se devuelve si existe, tenga o no proyectos y esté o no activo en el catálogo — es una consulta puntual, no pasa por el filtro de abajo. Ej. `?clave=viviendas-mejoradas` | (ninguno) |
| `todos` | `?todos=1` quita el filtro por omisión: devuelve el catálogo completo, activo o no, con proyectos o sin ellos — el comportamiento de esta API antes de este cambio. | sin este parámetro, solo activos y con proyecto |
| `historico_limite` | Cuántos puntos recientes trae `historico` por proyecto, como máximo | `60` (tope absoluto: `365`) |

`historico` siempre trae los puntos **más recientes**, nunca una página
intermedia — es lo que una gráfica necesita casi siempre ("lo último"), no
"la página 3 del historial completo". Si se necesita el historial completo
más allá del tope, hay que pedirlo explícitamente con un `historico_limite`
más alto (hasta 365).

## Identificador estable: `clave`

Un consumidor externo no puede depender de los UUIDs internos ni de los
nombres (que cambian si alguien corrige una redacción). Por eso cada
indicador del catálogo tiene una `clave` fija, asignada al crearse y que
nunca cambia — es el campo con el que el tablero debe emparejar su propia
serie histórica.

## Forma de la respuesta

```json
{
  "generado_en": "2026-10-28T19:40:00.000Z",
  "total": 22,
  "datos": [
    {
      "clave": "viviendas-mejoradas",
      "nombre": "Viviendas mejoradas en zonas metropolitanas",
      "descripcion": "...",
      "tipo": "Avance_fisico",
      "unidad": "Numero",
      "etiqueta_unidad": "viviendas",
      "definicion": "Cómo se mide exactamente...",
      "fuente": "Padrón único de beneficiarios",
      "activo": true,
      "meta_total": 5000,
      "avance_total": 1230,
      "porcentaje": 24.6,
      "proyectos": [
        {
          "proyecto_id": "uuid",
          "proyecto": "Mejoramiento de vivienda ZM Guadalajara",
          "estado": "En_proceso",
          "dg": "DGOTU",
          "meta": 2000,
          "avance": 800,
          "capturado_por": "Nombre del usuario",
          "actualizado_en": "2026-10-15T14:22:00.000Z",
          "fecha_corte": "2026-10-10",
          "historico": [
            { "fecha": "2026-08-01", "valor": 300 },
            { "fecha": "2026-09-12", "valor": 550 },
            { "fecha": "2026-10-10", "valor": 800 }
          ]
        }
      ]
    }
  ]
}
```

### Nivel indicador (agregado de todos los proyectos que lo miden)

| Campo | Significado |
|---|---|
| `clave` | Identificador estable — ver arriba. Úsalo para emparejar series, no el `nombre`. |
| `nombre`, `descripcion`, `tipo`, `definicion`, `fuente` | La definición del indicador, tal como vive en el catálogo. `definicion`/`fuente` pueden venir `null` cuando el catálogo solo tiene ahí una nota de mantenimiento interna (nunca pensada para salir de la plataforma) en vez de contenido real. |
| `unidad` | `Porcentaje`, `Moneda_MXN` o `Numero`. |
| `etiqueta_unidad` | Para `Numero`: qué se cuenta (ej. "viviendas", "expedientes"). Vacío para `Porcentaje`/`Moneda_MXN` (ahí la unidad ya es autoexplicativa). |
| `activo` | Si el indicador sigue vigente en el catálogo. Por omisión esta API ya no entrega los que no lo están (ver arriba); si pediste `?clave=` o `?todos=1` sí puede venir en `false` — revisa este campo antes de graficarlo como vigente. |
| `meta_total`, `avance_total` | Suma de la meta y el avance de **todos** los proyectos que lo miden. **Para `unidad: "Porcentaje"` esta suma no significa nada** (40% + 60% no son "100%" de nada real) — ignórala en ese caso y usa el desglose por proyecto. |
| `porcentaje` | `avance_total / meta_total * 100`, redondeado a un decimal. `null` si no hay meta capturada en ningún proyecto. **Sin tope**: un indicador sobre-cumplido reporta más de 100 a propósito (es información real, no un error que esta API esconda). |

### Nivel proyecto (uno por cada proyecto que mide ese indicador)

| Campo | Significado |
|---|---|
| `proyecto_id`, `proyecto`, `estado`, `dg` | El proyecto dueño de este avance y su Dirección General. |
| `meta`, `avance` | La meta y el avance de **este proyecto en particular** (no el agregado). |
| `capturado_por` | Quién dio de alta el indicador en este proyecto. |
| `actualizado_en` | **Fecha del registro, no del dato.** Es `updated_at` de la fila — se mueve con cualquier edición (renombrar, cambiar la meta, re-vincular el catálogo), no solo con una captura de avance. No la uses para "¿a qué fecha corresponde este número?" — para eso está `fecha_corte`. |
| `fecha_corte` | Fecha del movimiento de avance más reciente (no anulado). Esta es la fecha real del dato. Puede venir `null` si el indicador todavía no tiene ningún movimiento registrado en el nuevo historial. |
| `historico` | Arreglo de `{ fecha, valor }` — el valor **acumulado** a esa fecha (no el incremento de ese día), ya ordenado de más antiguo a más reciente. Pensado para dibujar directo una gráfica de línea. Puede venir vacío (`[]`). |

## Probar la API sin escribir código

En **Administración > API** hay un probador: eliges un indicador (o lo
dejas vacío para el catálogo completo) y ejecutas la consulta real. Esa
prueba corre con la sesión del administrador que la usa, **no con un
token real** — como se explicó arriba, el token nunca se puede recuperar
una vez creado. El botón "Copiar comando curl" junto al probador genera el
comando exacto (con `<token>` como marcador, a reemplazar por un token real
ya emitido) para probarlo desde una terminal o mandárselo a quien
desarrolla el tablero.

## Notas para quien construye el consumidor

- Todas las fechas van en UTC, formato ISO 8601 (`fecha_corte` es solo
  fecha, sin hora: `"2026-10-10"`).
- Un indicador del catálogo que ningún proyecto usa todavía aparece igual,
  con `proyectos: []` y los totales en cero — así se conoce el universo
  completo del catálogo, no solo lo que ya tiene datos.
- Esta API nunca borra históricamente nada que ya se haya capturado: un
  valor corregido queda como un movimiento nuevo en `historico`, no como
  una reescritura silenciosa del anterior.
