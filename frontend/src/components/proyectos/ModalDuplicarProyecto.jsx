/**
 * ARCHIVO: ModalDuplicarProyecto.jsx
 * PROPÓSITO: Crear un proyecto nuevo copiando la estructura de otro —
 *            varios proyectos repiten el mismo armazón de etapas y
 *            acciones, y capturarlo de cero cada vez es trabajo mecánico.
 *
 * MINI-CLASE: qué se copia y qué no, dicho en la propia interfaz
 * ─────────────────────────────────────────────────────────────────
 * La duda de quien duplica siempre es la misma: "¿se va a llevar el
 * avance del proyecto viejo?". Por eso la respuesta está a la vista y
 * no escondida en un tooltip: la estructura viaja siempre, el avance y
 * el historial (comentarios, riesgos, actividad) nunca, y lo de en
 * medio se elige con casillas. Cada casilla dice en una línea qué
 * trae, para no obligar a adivinar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Copy, Search, Calendar, MapPin, BarChart3, Users, Paperclip, Check } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';
import * as etapasApi from '../../api/etapas';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';

const OPCIONES = [
  { clave: 'fechas', icono: Calendar, etiqueta: 'Fechas',
    ayuda: 'Fechas de inicio y compromiso de cada etapa, acción y tarea.' },
  { clave: 'indicadores', icono: BarChart3, etiqueta: 'Indicadores',
    ayuda: 'La definición y las metas. El valor alcanzado empieza en cero.' },
  { clave: 'territorio', icono: MapPin, etiqueta: 'Territorio',
    ayuda: 'Estados, municipios y zonas metropolitanas asignados a cada elemento.' },
  { clave: 'participantes', icono: Users, etiqueta: 'Participantes',
    ayuda: 'Las mismas personas, con su rol y sus asignaciones por elemento.' },
  { clave: 'archivos', icono: Paperclip, etiqueta: 'Archivos adjuntos',
    ayuda: 'Copia los archivos del proyecto original. Puede tardar si son muchos.' },
];

function cuentaEstructura(arbol) {
  let etapas = 0, acciones = 0, tareas = 0;
  for (const e of arbol || []) {
    etapas++;
    for (const a of e.acciones || []) {
      acciones++;
      acciones += (a.subacciones || []).length;
      tareas += (a.tareas || []).length;
    }
  }
  return { etapas, acciones, tareas };
}

export default function ModalDuplicarProyecto({ proyectoOrigen = null, onCerrar, mostrarToast, onDuplicado }) {
  // Cuando se abre desde la ficha de un proyecto ya sabemos el origen; desde
  // "Nuevo proyecto" hay que elegirlo primero.
  const [origen, setOrigen] = useState(proyectoOrigen);
  const [candidatos, setCandidatos] = useState([]);
  const [buscando, setBuscando] = useState(!proyectoOrigen);
  const [busqueda, setBusqueda] = useState('');

  const [nombre, setNombre] = useState('');
  const [incluir, setIncluir] = useState({
    fechas: false, indicadores: true, territorio: true, participantes: false, archivos: false,
  });
  const [estructura, setEstructura] = useState(null);
  const [error, setError] = useState(null);

  // Lista de proyectos para elegir origen
  useEffect(() => {
    if (proyectoOrigen) return;
    let vivo = true;
    (async () => {
      setBuscando(true);
      try {
        const res = await proyectosApi.listarProyectos({ limite: 50, busqueda: busqueda || undefined });
        // El listado devuelve { datos: { proyectos, total, pagina, limite } },
        // no un arreglo directo como el resto de endpoints.
        if (vivo) setCandidatos(res.datos?.proyectos || []);
      } catch {
        if (vivo) setError('No se pudo cargar la lista de proyectos.');
      } finally {
        if (vivo) setBuscando(false);
      }
    })();
    return () => { vivo = false; };
  }, [busqueda, proyectoOrigen]);

  // Al fijar el origen: proponer nombre y contar qué se va a copiar, para
  // que la decisión no sea a ciegas.
  useEffect(() => {
    if (!origen) { setEstructura(null); return; }
    setNombre(`Copia de ${origen.nombre}`);
    let vivo = true;
    (async () => {
      setEstructura(null);
      try {
        const res = await etapasApi.obtenerArbol(origen.id);
        if (vivo) setEstructura(cuentaEstructura(res.datos));
      } catch {
        if (vivo) setEstructura({ etapas: 0, acciones: 0, tareas: 0, fallo: true });
      }
    })();
    return () => { vivo = false; };
  }, [origen]);

  const [confirmar, duplicando] = useEnvioUnico(async () => {
    if (!origen || !nombre.trim()) return;
    setError(null);
    try {
      const res = await proyectosApi.duplicarProyecto(origen.id, { nombre: nombre.trim(), incluir });
      mostrarToast?.('Proyecto duplicado', 'exito');
      onDuplicado?.(res.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo duplicar el proyecto.');
    }
  });

  const total = estructura ? estructura.etapas + estructura.acciones + estructura.tareas : 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-guinda-600" />
            <h3 className="text-sm font-semibold text-gray-900">Duplicar un proyecto</h3>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* Paso 1 — elegir el proyecto a copiar (solo si no vino dado) */}
          {!proyectoOrigen && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">¿Qué proyecto quieres copiar?</label>
              {origen ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border border-guinda-200 bg-guinda-50/50 rounded-lg">
                  <span className="text-sm text-gray-800 truncate">{origen.nombre}</span>
                  <button onClick={() => setOrigen(null)} className="text-xs text-guinda-600 hover:underline flex-shrink-0">
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      placeholder="Buscar proyecto..."
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {buscando ? (
                      <div className="flex items-center justify-center py-6 text-gray-400">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : candidatos.length === 0 ? (
                      <p className="text-xs text-gray-500 px-3 py-4 text-center">Sin proyectos que coincidan.</p>
                    ) : candidatos.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setOrigen(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm text-gray-800 block truncate">{p.nombre}</span>
                        {p.dg_lider_siglas && <span className="text-[11px] text-gray-400">{p.dg_lider_siglas}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {origen && (
            <>
              {/* Qué se va a copiar, en números — evita duplicar a ciegas */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                {estructura === null ? (
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Revisando la estructura...
                  </span>
                ) : total === 0 ? (
                  <p className="text-xs text-amber-700">
                    Este proyecto todavía no tiene estructura capturada: se creará el proyecto nuevo vacío.
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">
                    Se copiarán <strong className="text-gray-900">{estructura.etapas} {estructura.etapas === 1 ? 'etapa' : 'etapas'}</strong>
                    {estructura.acciones > 0 && <>, <strong className="text-gray-900">{estructura.acciones} {estructura.acciones === 1 ? 'acción' : 'acciones'}</strong></>}
                    {estructura.tareas > 0 && <> y <strong className="text-gray-900">{estructura.tareas} {estructura.tareas === 1 ? 'tarea' : 'tareas'}</strong></>}.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre del proyecto nuevo</label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  placeholder="Nombre del proyecto"
                  autoFocus
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-gray-700 mb-2">¿Qué más quieres traer?</span>
                <div className="space-y-1.5">
                  {OPCIONES.map(op => (
                    <label
                      key={op.clave}
                      className={`flex items-start gap-2.5 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                        incluir[op.clave] ? 'border-guinda-200 bg-guinda-50/40' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={incluir[op.clave]}
                        onChange={e => setIncluir(prev => ({ ...prev, [op.clave]: e.target.checked }))}
                        className="mt-0.5 accent-guinda-600 flex-shrink-0"
                      />
                      <op.icono size={14} className={`mt-0.5 flex-shrink-0 ${incluir[op.clave] ? 'text-guinda-600' : 'text-gray-400'}`} />
                      <span className="min-w-0">
                        <span className="text-sm text-gray-800 block leading-tight">{op.etiqueta}</span>
                        <span className="text-[11px] text-gray-500 block leading-snug mt-0.5">{op.ayuda}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* La duda recurrente al duplicar, respondida sin tener que preguntar */}
              <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
                <Check size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <span>
                  El proyecto nuevo empieza <strong>desde cero</strong>: sin avance, sin comentarios,
                  sin riesgos y sin historial de actividad. El proyecto original no se modifica.
                </span>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={!origen || !nombre.trim() || duplicando}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {duplicando ? <><Loader2 size={14} className="animate-spin" /> Duplicando...</> : <><Copy size={14} /> Duplicar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
