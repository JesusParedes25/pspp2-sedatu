/**
 * ARCHIVO: TabTransferenciaAdmin.jsx
 * PROPÓSITO: Transferir la administración de un proyecto a otro miembro
 *            — exclusivo de superadmin (ver docs/modelo-permisos.md).
 *
 * MINI-CLASE: por qué no vive en Configuración del proyecto
 * ─────────────────────────────────────────────────────────────────
 * Es una decisión de producto, no un descuido: hoy solo un superadmin
 * puede transferir la administración (el propio administrador cediéndola
 * por su cuenta queda para una versión posterior). Ponerlo en
 * Configuración del proyecto pondría un botón que casi ningún usuario
 * que lo ve podría usar — frustración sin beneficio. Vive aquí, en la
 * zona de administración, que ya está blindada con requiereRol(['superadmin']).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, ArrowRightLeft, ShieldCheck, X, CheckCircle } from 'lucide-react';
import * as adminApi from '../../api/admin';
import * as proyectosApi from '../../api/proyectos';
import * as miembrosApi from '../../api/miembros';
import ConfirmDialog from '../common/ConfirmDialog';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';

export default function TabTransferenciaAdmin() {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [proyecto, setProyecto] = useState(null); // { id, nombre } elegido

  const [miembros, setMiembros] = useState([]);
  const [cargandoMiembros, setCargandoMiembros] = useState(false);
  const [destinatarioId, setDestinatarioId] = useState('');
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  // Buscar proyecto por nombre — GET /proyectos?busqueda= ya existe y no
  // necesita cambio de backend; superadmin ve cualquier proyecto sin
  // restricción de visibilidad.
  useEffect(() => {
    if (!busqueda.trim() || busqueda.trim().length < 2) { setResultados([]); return; }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await proyectosApi.listarProyectos({ busqueda: busqueda.trim(), limite: 8 });
        if (vivo) setResultados(r.datos.proyectos || []);
      } catch { if (vivo) setResultados([]); }
      finally { if (vivo) setBuscando(false); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  const cargarMiembros = useCallback(async (proyectoId) => {
    setCargandoMiembros(true);
    setError('');
    try {
      const datos = await miembrosApi.listarMiembros(proyectoId);
      setMiembros(datos || []);
    } catch (e) {
      setError(e.response?.data?.mensaje || 'No se pudieron cargar los miembros del proyecto');
      setMiembros([]);
    } finally {
      setCargandoMiembros(false);
    }
  }, []);

  function elegirProyecto(p) {
    setProyecto(p);
    setResultados([]);
    setBusqueda('');
    setDestinatarioId('');
    setExito(null);
    cargarMiembros(p.id);
  }

  function cambiarProyecto() {
    setProyecto(null);
    setMiembros([]);
    setDestinatarioId('');
    setExito(null);
    setError('');
  }

  const administradorActual = miembros.find(m => m.rol === 'administracion_proyecto' && m.estado === 'aceptada');
  // Candidatos: miembros aceptados, que no sean ya el administrador, y
  // que no sean perfil externo (un externo nunca puede recibirla).
  const candidatos = miembros.filter(m =>
    m.estado === 'aceptada' && m.rol_sistema !== 'externo' && m.id_usuario !== administradorActual?.id_usuario
  );
  const destinatario = candidatos.find(c => c.id_usuario === destinatarioId);

  const [confirmarTransferencia, transfiriendo] = useEnvioUnico(async () => {
    setError('');
    try {
      await adminApi.transferirAdministracionProyecto(proyecto.id, destinatarioId);
      setExito({ nombre: destinatario.nombre_completo });
      setDestinatarioId('');
      setPorConfirmar(false);
      await cargarMiembros(proyecto.id);
    } catch (e) {
      setError(e.response?.data?.mensaje || 'No se pudo transferir la administración');
      setPorConfirmar(false);
    }
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <ArrowRightLeft size={18} className="text-guinda-600" />
        <h3 className="font-semibold text-gray-800">Transferir administración de un proyecto</h3>
      </div>
      <p className="text-xs text-gray-500">
        El destinatario queda como administrador(a) del proyecto. Quien administraba antes no se elimina
        del proyecto: queda como responsable. Solo un superadministrador puede hacer esta transferencia —
        la cesión por parte del propio administrador queda pendiente para una versión posterior.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!proyecto ? (
        <div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar proyecto por nombre..."
              className="input-base pl-9 text-sm"
            />
            {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
          </div>
          {resultados.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white overflow-hidden">
              {resultados.map(p => (
                <button
                  key={p.id}
                  onClick={() => elegirProyecto(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{p.nombre}</span>
                  {p.dg_lider_siglas && <span className="text-xs text-gray-400 flex-shrink-0">{p.dg_lider_siglas}</span>}
                </button>
              ))}
            </div>
          )}
          {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">Sin resultados para "{busqueda.trim()}".</p>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Proyecto</p>
              <p className="font-medium text-gray-800 truncate">{proyecto.nombre}</p>
            </div>
            <button onClick={cambiarProyecto} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Elegir otro proyecto">
              <X size={16} />
            </button>
          </div>

          {cargandoMiembros ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-guinda-600" /></div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                <ShieldCheck size={15} className="text-guinda-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Administrador(a) actual</p>
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {administradorActual ? `${administradorActual.nombre_completo} — ${administradorActual.correo}` : 'Sin administrador asignado'}
                  </p>
                </div>
              </div>

              {exito && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <CheckCircle size={16} />
                  Administración transferida a {exito.nombre}.
                </div>
              )}

              {administradorActual && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo(a) administrador(a)</label>
                  {candidatos.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No hay otro miembro aceptado (no externo) de este proyecto al que transferirle la administración.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select value={destinatarioId} onChange={e => setDestinatarioId(e.target.value)} className="input-base text-sm flex-1">
                        <option value="">Selecciona una persona...</option>
                        {candidatos.map(c => (
                          <option key={c.id_usuario} value={c.id_usuario}>{c.nombre_completo} — {c.correo} ({c.rol})</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setPorConfirmar(true)}
                        disabled={!destinatarioId}
                        className="flex items-center gap-1.5 px-3 py-2 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600 disabled:opacity-40 flex-shrink-0"
                      >
                        <ArrowRightLeft size={14} /> Transferir
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        abierto={porConfirmar}
        titulo="Transferir administración"
        mensaje={destinatario ? `¿Transferir la administración de "${proyecto?.nombre}" a ${destinatario.nombre_completo}? ${administradorActual?.nombre_completo || 'La persona actual'} dejará de administrar el proyecto y quedará como responsable.` : ''}
        textoConfirmar={transfiriendo ? 'Transfiriendo...' : 'Sí, transferir'}
        variante="normal"
        onConfirmar={confirmarTransferencia}
        onCancelar={() => setPorConfirmar(false)}
      />
    </div>
  );
}
