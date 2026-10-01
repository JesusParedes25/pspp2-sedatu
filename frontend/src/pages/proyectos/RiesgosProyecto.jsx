/**
 * ARCHIVO: RiesgosProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/riesgos — sección propia de Riesgos,
 *            al mismo nivel que Seguimiento/Resumen/Documentos/Bitácora/
 *            Configuración. Antes vivía solo como un bloque al fondo de
 *            Resumen (lista completa, sin filtros ni alta directa); esta
 *            sección es la casa completa: lista separada en abiertos/
 *            cerrados, filtros por estatus y nivel de impacto, y alta/
 *            edición/cierre desde aquí mismo — reusando ModalRiesgo y
 *            RiesgoCard, que ya hacían todo esto por nodo individual
 *            (ver PanelRiesgos.jsx), solo que ahora a nivel de proyecto
 *            completo.
 *
 * Campos mostrados por riesgo (lo que pidió el usuario, confirmado contra
 * el modelo real antes de construir esto): descripción, nivel de impacto
 * (`nivel`), nodo/etapa asociado (`nombre_entidad`, resuelto en el
 * backend), responsable, fecha en que se identificó (`created_at`) y
 * fecha de cierre cuando aplica (`fecha_cierre`, columna nueva — no
 * existía, se agregó en la migración 078 porque `updated_at` no sirve:
 * un riesgo ya cerrado se puede seguir editando por otras razones sin que
 * eso signifique que se cerró de nuevo). Medida de mitigación: el modelo
 * SÍ la guarda (`medida_mitigacion`, un campo de texto libre, no una
 * lista de acciones discretas) y ya se muestra en RiesgoCard.
 *
 * "Probabilidad" NO existe en el modelo — no se agregó un campo nuevo sin
 * confirmar primero con el usuario (se le avisó explícitamente).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Plus, ShieldAlert, Loader2 } from 'lucide-react';
import RiesgoCard from '../../components/riesgos/RiesgoCard';
import ModalRiesgo from '../../components/riesgos/ModalRiesgo';
import * as riesgosApi from '../../api/riesgos';
import { useUI } from '../../context/UIContext';

const ESTATUS = ['Abierto', 'En_mitigacion', 'Resuelto', 'Cerrado'];
const NIVELES_IMPACTO = ['Bajo', 'Medio', 'Alto', 'Critico'];
const ESTADOS_ABIERTOS = ['Abierto', 'En_mitigacion'];

export default function RiesgosProyecto() {
  const { proyecto, proyectoId, permisos, incrementarStats } = useOutletContext();
  const { mostrarToast } = useUI();
  const [searchParams, setSearchParams] = useSearchParams();
  const [riesgos, setRiesgos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null); // null | 'crear' | riesgoObj
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('');

  const soloLectura = permisos?.esSoloLectura;

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    try {
      const res = await riesgosApi.obtenerRiesgosProyecto(proyectoId);
      setRiesgos(res.datos || []);
    } catch {
      setRiesgos([]);
    } finally {
      setCargando(false);
    }
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Atajo "Registrar riesgo" de la Portada (?nuevo=1): abre el modal de
  // alta directo al llegar.
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setModal('crear');
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('nuevo'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const riesgosFiltrados = useMemo(() => riesgos.filter(r =>
    (!filtroEstatus || r.estado === filtroEstatus) &&
    (!filtroNivel || r.nivel === filtroNivel)
  ), [riesgos, filtroEstatus, filtroNivel]);

  const abiertos = riesgosFiltrados.filter(r => ESTADOS_ABIERTOS.includes(r.estado));
  const cerrados = riesgosFiltrados.filter(r => !ESTADOS_ABIERTOS.includes(r.estado));

  async function handleGuardar(datos) {
    const esEdicion = modal && modal !== 'crear';
    if (esEdicion) {
      await riesgosApi.actualizarRiesgo(modal.id, datos);
    } else {
      await riesgosApi.crearRiesgo({ ...datos, entidad_tipo: datos.entidad_tipo || 'Proyecto', entidad_id: datos.entidad_id || proyectoId });
    }
    setModal(null);
    await cargar();
    incrementarStats?.();
    mostrarToast(esEdicion ? 'Riesgo actualizado' : 'Riesgo registrado', 'exito');
  }

  // Cierre rápido sin abrir el modal completo — la tarjeta ya tiene todo
  // lo necesario a la vista, obligar a abrir-editar-guardar para algo tan
  // frecuente como "esto ya se resolvió" era fricción de más.
  async function cerrarRapido(riesgo) {
    try {
      await riesgosApi.actualizarRiesgo(riesgo.id, { estado: 'Cerrado' });
      await cargar();
      incrementarStats?.();
      mostrarToast('Riesgo cerrado', 'exito');
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al cerrar', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Estatus</label>
            <select
              value={filtroEstatus}
              onChange={e => setFiltroEstatus(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            >
              <option value="">Todos</option>
              {ESTATUS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Nivel de impacto</label>
            <select
              value={filtroNivel}
              onChange={e => setFiltroNivel(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            >
              <option value="">Todos</option>
              {NIVELES_IMPACTO.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {(filtroEstatus || filtroNivel) && (
            <button
              onClick={() => { setFiltroEstatus(''); setFiltroNivel(''); }}
              className="text-xs text-guinda-500 hover:text-guinda-700 font-medium mt-4"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        {!soloLectura && (
          <button onClick={() => setModal('crear')} className="btn-primary text-sm flex items-center gap-1.5 rounded-lg">
            <Plus size={15} /> Registrar riesgo
          </button>
        )}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando riesgos…
        </div>
      ) : riesgos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShieldAlert size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Este proyecto no tiene riesgos registrados todavía.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Abiertos ({abiertos.length})
            </h3>
            {abiertos.length === 0 ? (
              <p className="text-xs text-gray-300 py-2">Sin riesgos abiertos con los filtros aplicados.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {abiertos.map(r => (
                  <div key={r.id} className="group relative">
                    <button onClick={() => !soloLectura && setModal(r)} className="w-full text-left">
                      <RiesgoCard riesgo={r} mostrarNodo />
                    </button>
                    {!soloLectura && (
                      <button
                        onClick={() => cerrarRapido(r)}
                        className="absolute top-3 right-3 text-[11px] font-medium text-gray-400 hover:text-green-600 bg-white/90 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Cerrar este riesgo"
                      >
                        Cerrar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Cerrados ({cerrados.length})
            </h3>
            {cerrados.length === 0 ? (
              <p className="text-xs text-gray-300 py-2">Sin riesgos resueltos o cerrados con los filtros aplicados.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 opacity-75">
                {cerrados.map(r => (
                  <button key={r.id} onClick={() => !soloLectura && setModal(r)} className="w-full text-left">
                    <RiesgoCard riesgo={r} mostrarNodo />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {modal && (
        <ModalRiesgo
          riesgo={modal !== 'crear' ? modal : null}
          entidadTipo={modal !== 'crear' ? modal.entidad_tipo : 'Proyecto'}
          entidadId={modal !== 'crear' ? modal.entidad_id : proyectoId}
          onGuardar={handleGuardar}
          onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}
