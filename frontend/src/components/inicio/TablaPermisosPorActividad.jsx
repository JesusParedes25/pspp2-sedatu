/**
 * ARCHIVO: TablaPermisosPorActividad.jsx
 * PROPÓSITO: Guía de uso, Parte 3 (bloque 5.3 de "PSPP v2.0 · Inicio,
 *            color y la guía de uso") — qué puede hacer cada permiso en
 *            cada actividad. Cada palomita de abajo se verificó contra
 *            el código (no se infirió de la descripción de Configuración
 *            > Visibilidad y acceso) antes de escribirse aquí:
 *
 *   Fila                              | Función que lo respalda
 *   -----------------------------------|----------------------------------
 *   Consultar la actividad y          | puedeVerProyecto
 *   sus documentos                    | (backend/src/utils/autorizacion.js)
 *                                      | — visibilidad total para cualquier
 *                                      | persona interna, sin importar su
 *                                      | peldaño; "lectura" es la única
 *                                      | fila donde SÍ alcanza.
 *   Registrar avance /                | puedeEditarContenidoProyecto /
 *   Escribir notas de avance /        | puedeEditarNodo (autorizacion.js)
 *   Subir documentos y evidencias /    | — mínimo 'captura'. Riesgos,
 *   Vincular territorio /              | documentos, indicadores,
 *   Vincular indicadores /             | territorio y comentarios son la
 *   Reportar riesgos                   | misma lista de capacidades que ya
 *                                      | documenta el comentario de esa
 *                                      | función.
 *   Cambiar el estado                  | minimoParaPatchNodo (autorizacion.js)
 *                                      | + tienePermisoCambiarEstado
 *                                      | (estado.controller.js) — 'estado'
 *                                      | NO está en CAMPOS_FICHA_NODO, así
 *                                      | que a nivel etapa/acción/tarea
 *                                      | basta 'captura' (no 'responsable').
 *   Crear etapas, acciones o           | puedeGestionarNodo (autorizacion.js)
 *   tareas / Eliminarlas               | — mínimo 'responsable', evaluado
 *                                      | en el PADRE del nodo (o en el
 *                                      | proyecto, si es una etapa de
 *                                      | primer nivel), vía
 *                                      | resolverAccesoPadreDeNodo.
 *   Invitar o retirar personas         | puedeGestionarParticipantes /
 *                                      | puedeGestionarParticipantesNodo
 *                                      | (autorizacion.js) — mínimo
 *                                      | 'responsable'.
 *
 * "Administrador" cumple todas las filas: a nivel nodo, funcion-efectiva.js
 * (topeNodo) limita 'administracion_proyecto' a 'responsable' — nunca a
 * menos — así que alcanza cualquier mínimo de esta tabla.
 *
 * "Ceder la administración del proyecto" NO es una fila de esta tabla:
 * se verificó (miembros.controller.js::transferirAdministracionProyecto,
 * montado detrás de requiereRol(['superadmin']) en admin.routes.js, y
 * SelectorFuncion.jsx, que documenta "administracion_proyecto nunca vive
 * aquí... se transfiere, Fase 4 parte B, pendiente") que NINGUNO de los 4
 * permisos puede cederla por su cuenta hoy — es una operación exclusiva
 * de superadministrador, deliberada, no un hueco del código. Se explica
 * aparte, en la nota al pie de la tabla, no como un renglón con columnas
 * en blanco.
 */
const COLUMNAS = ['Solo lectura', 'Colaborador', 'Responsable', 'Administrador'];

// Cada fila: [Solo lectura, Colaborador, Responsable, Administrador]
const FILAS = [
  { accion: 'Consultar la actividad y sus documentos', capacidades: [true, true, true, true] },
  { accion: 'Registrar avance', capacidades: [false, true, true, true] },
  { accion: 'Escribir notas de avance', capacidades: [false, true, true, true] },
  { accion: 'Subir documentos y evidencias', capacidades: [false, true, true, true] },
  { accion: 'Vincular territorio', capacidades: [false, true, true, true] },
  { accion: 'Vincular indicadores', capacidades: [false, true, true, true] },
  { accion: 'Reportar riesgos', capacidades: [false, true, true, true] },
  { accion: 'Cambiar el estado', capacidades: [false, true, true, true] },
  { accion: 'Crear etapas, acciones o tareas', capacidades: [false, false, true, true] },
  { accion: 'Eliminarlas', capacidades: [false, false, true, true] },
  { accion: 'Invitar o retirar personas', capacidades: [false, false, true, true] },
];

export default function TablaPermisosPorActividad() {
  return (
    <div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-guinda-700 text-white">
                <th className="px-3 py-2.5 text-left text-xs font-semibold">Acción</th>
                {COLUMNAS.map(col => (
                  <th key={col} className="px-3 py-2.5 text-center text-xs font-semibold whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {FILAS.map(fila => (
                <tr key={fila.accion} className="odd:bg-white even:bg-gray-50/60">
                  <td className="px-3 py-2 text-gray-700">{fila.accion}</td>
                  {fila.capacidades.map((puede, i) => (
                    <td key={COLUMNAS[i]} className="px-3 py-2 text-center">
                      {puede ? (
                        <span className="text-guinda-600 font-bold" aria-label="Sí">✓</span>
                      ) : (
                        <span className="text-gray-300" aria-label="No">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Para transferir la administración de un proyecto a otra persona, solicítalo al administrador del sistema.
      </p>
    </div>
  );
}
