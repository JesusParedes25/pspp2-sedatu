/**
 * ARCHIVO: ModalRiesgo.jsx
 * PROPÓSITO: Modal reutilizable para crear o editar un riesgo/problema.
 *
 * MINI-CLASE: Formularios con modo crear/editar
 * ─────────────────────────────────────────────────────────────────
 * Si recibe prop `riesgo`, entra en modo edición y pre-rellena
 * los campos. Si no, entra en modo creación. El formulario valida
 * campos obligatorios antes de enviar. Soporta cualquier nivel
 * jerárquico gracias a entidad_tipo + entidad_id.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import client from '../../api/client';
import { obtenerPanorama } from '../../api/miembros';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';
import { useCierreConDatosSinGuardar } from '../../hooks/useCierreConDatosSinGuardar';
import SelectorNodoArbol from '../indicadores/SelectorNodoArbol';

const FORM_VACIO = {
  titulo: '', descripcion: '', causa: '', impacto: '', nivel: 'Medio', tipo: 'Riesgo',
  estado: 'Abierto', medida_mitigacion: '', fecha_limite_resolucion: '', id_responsable: '',
};

const TIPOS = ['Riesgo', 'Problema'];
const NIVELES = ['Bajo', 'Medio', 'Alto', 'Critico'];
const ESTADOS_RIESGO = ['Abierto', 'En_mitigacion', 'Resuelto', 'Cerrado'];

const NIVEL_COLORES = {
  Bajo:    'bg-green-100 text-green-700',
  Medio:   'bg-yellow-100 text-yellow-700',
  Alto:    'bg-orange-100 text-orange-700',
  Critico: 'bg-red-100 text-red-700',
};

/**
 * @param {object}   riesgo       - Riesgo existente (modo edición) o null (modo creación)
 * @param {string}   entidadTipo  - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'|'Tarea'
 * @param {string}   entidadId    - UUID de la entidad padre
 * @param {string}   proyectoId   - (opcional) proyecto al que pertenece, para acotar
 *                                  el selector de Responsable a quien participa en él
 *                                  (cualquier función) en vez de listar a todos los
 *                                  usuarios del sistema. Sin esta prop se cae al
 *                                  catálogo completo (comportamiento de antes — no
 *                                  debería faltar en ningún punto de la app hoy).
 * @param {array}    etapas       - (opcional, solo aplica en modo creación) árbol de
 *                                  etapas del proyecto (misma forma que ya consume
 *                                  SelectorNodoArbol) — si se pasa, se puede elegir
 *                                  una etapa/acción/tarea específica a la que ligar
 *                                  el riesgo, en vez de que siempre quede al nivel
 *                                  fijo de `entidadTipo`/`entidadId`.
 * @param {function} onGuardar    - Recibe los datos del formulario
 * @param {function} onCerrar     - Cierra el modal
 */
export default function ModalRiesgo({ riesgo, entidadTipo, entidadId, proyectoId, etapas, onGuardar, onCerrar }) {
  const editando = !!riesgo;

  // formInicial: snapshot contra el que se mide "¿hay algo sin guardar?"
  // (ver useCierreConDatosSinGuardar más abajo) — vacío al crear, o el
  // riesgo ya existente al editar, para no marcar como "cambio" lo que
  // ya traía de antes.
  function formDesdeRiesgo(r) {
    if (!r) return FORM_VACIO;
    return {
      titulo: r.titulo || '',
      descripcion: r.descripcion || '',
      causa: r.causa || '',
      impacto: r.impacto || '',
      nivel: r.nivel || 'Medio',
      tipo: r.tipo || 'Riesgo',
      estado: r.estado || 'Abierto',
      medida_mitigacion: r.medida_mitigacion || '',
      fecha_limite_resolucion: r.fecha_limite_resolucion ? r.fecha_limite_resolucion.substring(0, 10) : '',
      id_responsable: r.id_responsable || '',
    };
  }

  const [form, setForm] = useState(() => formDesdeRiesgo(riesgo));
  const [formInicial, setFormInicial] = useState(() => formDesdeRiesgo(riesgo));
  const [errores, setErrores] = useState({});
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    if (riesgo) {
      const f = formDesdeRiesgo(riesgo);
      setForm(f);
      setFormInicial(f);
    }
  }, [riesgo]);

  // nodoSeleccionado: etapa/acción/tarea elegida en el selector de abajo
  // (null = al nivel de entidadTipo/entidadId recibido, el único caso que
  // existía antes de este selector).
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null);

  const hayCambiosSinGuardar = Object.keys(form).some(k => form[k] !== formInicial[k]) || nodoSeleccionado !== null;
  const { cerrarConConfirmacion } = useCierreConDatosSinGuardar(hayCambiosSinGuardar, onCerrar);

  // Catálogo de responsables para el selector — acotado a quien participa
  // en ESTE proyecto, en cualquier función (colaborador, responsable,
  // lectura...), el mismo dato que ya usa "Equipo y permisos"
  // (obtenerTodosParticipantes en el backend, vía GET /proyectos/:id/panorama
  // — mismo patrón que ya sigue GestorUsuariosProyecto.jsx). Antes este
  // selector ofrecía CUALQUIER usuario del sistema (/catalogos/usuarios),
  // sin relación con el proyecto. Sin proyectoId (no debería faltar en
  // ningún punto de la app hoy) se cae a ese catálogo completo en vez de
  // dejar el selector vacío.
  useEffect(() => {
    (async () => {
      try {
        if (proyectoId) {
          const datos = await obtenerPanorama(proyectoId);
          const lista = (datos.miembros || [])
            .map(m => ({ id: m.id_usuario, nombre_completo: m.nombre_completo, dg_siglas: m.dg_siglas }))
            .sort((a, b) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''));
          setUsuarios(lista);
        } else {
          const { data } = await client.get('/catalogos/usuarios');
          setUsuarios(data.datos || []);
        }
      } catch { /* selector se queda vacío, no bloquea el resto del form */ }
    })();
  }, [proyectoId]);

  // id de nodo -> entidad_tipo capitalizado que espera la tabla riesgos,
  // para resolver qué mandar al guardar. Mismo criterio que ya usa
  // PanoramaProyecto.jsx para distinguir Acción de Subacción
  // (id_accion_padre) — el árbol de etapasApi.obtenerArbol no las separa
  // por un `tipo` propio, solo anida las subacciones dentro de su padre.
  const indiceNodos = useMemo(() => {
    const mapa = new Map();
    for (const etapa of etapas || []) {
      mapa.set(etapa.id, 'Etapa');
      for (const accion of etapa.acciones || []) {
        mapa.set(accion.id, 'Accion');
        for (const sub of accion.subacciones || []) mapa.set(sub.id, 'Subaccion');
        for (const tarea of accion.tareas || []) mapa.set(tarea.id, 'Tarea');
      }
    }
    return mapa;
  }, [etapas]);

  function cambiarCampo(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }));
    if (errores[campo]) setErrores(prev => ({ ...prev, [campo]: null }));
  }

  function validar() {
    const e = {};
    if (!form.titulo.trim()) e.titulo = 'El título es obligatorio';
    if (!form.nivel) e.nivel = 'El nivel es obligatorio';
    if (!form.tipo) e.tipo = 'El tipo es obligatorio';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  // e.preventDefault() vive en handleSubmit, FUERA del candado: si se
  // envolviera el evento completo, un segundo submit bloqueado saldría
  // por el early-return del candado sin llamar preventDefault, y el
  // navegador haría submit nativo (recarga de página).
  const [guardar, guardando] = useEnvioUnico(async () => {
    if (!validar()) return;
    try {
      const datos = {
        ...form,
        entidad_tipo: nodoSeleccionado ? (indiceNodos.get(nodoSeleccionado.id) || entidadTipo) : entidadTipo,
        entidad_id: nodoSeleccionado ? nodoSeleccionado.id : entidadId,
        fecha_limite_resolucion: form.fecha_limite_resolucion || null,
        id_responsable: form.id_responsable || null,
      };
      await onGuardar(datos);
    } catch (err) {
      setErrores({ _general: err.response?.data?.mensaje || err.message || 'Error al guardar' });
    }
  });

  function handleSubmit(ev) {
    ev.preventDefault();
    guardar();
  }

  // createPortal a document.body: cuando este modal se abre desde NodoCard
  // dentro del rail de Detalle o el drawer de Diagrama, el ancestro con
  // translate-x se vuelve el "containing block" de cualquier hijo
  // position:fixed — sin el portal, el modal quedaba encajonado dentro del
  // panel en vez de cubrir toda la pantalla (mismo bug ya resuelto en
  // ModalRegistrarAvance.jsx).
  return createPortal((
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {editando ? 'Editar riesgo' : 'Nuevo riesgo'}
          </h3>
          <button onClick={cerrarConConfirmacion} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Form scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {errores._general && (
            <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{errores._general}</div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={e => cambiarCampo('titulo', e.target.value)}
              className={`w-full h-9 px-3 text-sm border rounded-lg outline-none focus:ring-2 ${
                errores.titulo ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="Ej: Retraso en aprobación de presupuesto"
            />
            {errores.titulo && <p className="text-xs text-red-500 mt-0.5">{errores.titulo}</p>}
          </div>

          {/* A qué nivel aplica — solo en creación y solo si quien abrió el
              modal pasó el árbol del proyecto (etapas): cuando ya se abre
              desde un nodo concreto (tarjeta de una etapa/acción/tarea,
              editar un riesgo existente) no hay ambigüedad que resolver y
              esta sección no aparece. */}
          {!editando && etapas && etapas.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                ¿A qué nivel aplica? <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <SelectorNodoArbol
                etapas={etapas}
                valor={nodoSeleccionado}
                onSeleccionar={(tipo, id) => setNodoSeleccionado(tipo ? { tipo, id } : null)}
                puedeEditar={() => true}
                yaVinculado={() => false}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Déjalo "a nivel de todo el proyecto" si no corresponde a una etapa o acción en particular.
              </p>
            </div>
          )}

          {/* Tipo + Nivel (inline) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
              <div className="flex gap-2">
                {TIPOS.map(t => (
                  <button key={t} type="button"
                    onClick={() => cambiarCampo('tipo', t)}
                    className={`flex-1 h-9 text-sm rounded-lg border font-medium transition-colors ${
                      form.tipo === t
                        ? 'bg-guinda-50 border-guinda-300 text-guinda-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nivel *</label>
              <div className="flex gap-1.5">
                {NIVELES.map(n => (
                  <button key={n} type="button"
                    onClick={() => cambiarCampo('nivel', n)}
                    className={`flex-1 h-9 text-xs rounded-lg border font-medium transition-colors ${
                      form.nivel === n
                        ? `${NIVEL_COLORES[n]} border-current`
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Responsable — proponer a alguien lo deja pendiente de que
              acepte (Notificaciones); si te lo asignas a ti mismo queda
              aceptado de una vez, porque no tiene sentido pedirte que
              aceptes tu propia asignación. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Responsable</label>
            <select
              value={form.id_responsable}
              onChange={e => cambiarCampo('id_responsable', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo}{u.dg_siglas ? ` (${u.dg_siglas})` : ''}
                </option>
              ))}
            </select>
            {editando && riesgo.id_responsable && riesgo.id_responsable === form.id_responsable && riesgo.estado_responsable && (
              <p className={`text-xs mt-1 ${
                riesgo.estado_responsable === 'aceptada' ? 'text-green-600'
                  : riesgo.estado_responsable === 'rechazada' ? 'text-red-600' : 'text-amber-600'
              }`}>
                {riesgo.estado_responsable === 'aceptada' && 'Aceptó ser responsable.'}
                {riesgo.estado_responsable === 'pendiente' && 'Pendiente de que acepte.'}
                {riesgo.estado_responsable === 'rechazada' && (
                  riesgo.motivo_rechazo ? `Declinó: ${riesgo.motivo_rechazo}` : 'Declinó ser responsable.'
                )}
              </p>
            )}
          </div>

          {/* Estado (solo en edición) */}
          {editando && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <div className="flex gap-1.5">
                {ESTADOS_RIESGO.map(e => (
                  <button key={e} type="button"
                    onClick={() => cambiarCampo('estado', e)}
                    className={`flex-1 h-9 text-xs rounded-lg border font-medium transition-colors ${
                      form.estado === e
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {e.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => cambiarCampo('descripcion', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Describe el riesgo o problema..."
            />
          </div>

          {/* Causa + Impacto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Causa</label>
              <textarea
                value={form.causa}
                onChange={e => cambiarCampo('causa', e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="¿Qué lo causa?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Impacto</label>
              <textarea
                value={form.impacto}
                onChange={e => cambiarCampo('impacto', e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="¿Qué efecto tiene?"
              />
            </div>
          </div>

          {/* Medida de atención — campo en BD sigue siendo medida_mitigacion,
              solo cambió la etiqueta que ve el usuario. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Medida de atención</label>
            <textarea
              value={form.medida_mitigacion}
              onChange={e => cambiarCampo('medida_mitigacion', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="¿Cómo se atiende?"
            />
          </div>

          {/* Fecha límite */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha límite de resolución</label>
            <input
              type="date"
              value={form.fecha_limite_resolucion}
              onChange={e => cambiarCampo('fecha_limite_resolucion', e.target.value)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={cerrarConConfirmacion}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-guinda-500 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-50 font-medium">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear riesgo'}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
