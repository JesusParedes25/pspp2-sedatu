/**
 * ARCHIVO: Indicadores.jsx
 * PROPÓSITO: "Mis indicadores" — casa del módulo de Indicadores. Antes,
 *            ver el avance de un indicador estaba repartido en tres
 *            implementaciones distintas de la misma tarjeta (Tablero,
 *            Resumen de cartera, Panorama del proyecto), sin ninguna
 *            forma de filtrar por proyecto. Esta pantalla es un lugar
 *            propio, filtrable, que reutiliza los mismos componentes
 *            (TarjetaIndicador) y el mismo criterio de alcance que ya
 *            usa Tablero — el mismo indicador muestra el mismo número
 *            sin importar desde dónde se consulte.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Loader2, Plus } from 'lucide-react';
import { obtenerProyectosFiltroInicio, obtenerCarterasFiltroInicio } from '../api/inicio';
import * as indicadoresApi from '../api/indicadores';
import FiltroTablero from '../components/inicio/FiltroTablero';
import { ETIQUETA_TIPO_INDICADOR, agruparPorCatalogo, TarjetaIndicadorOAgrupada } from '../components/indicadores/TarjetaIndicador';
import ModalVincularIndicador from '../components/indicadores/ModalVincularIndicador';
import CatalogoIndicadores from '../components/indicadores/CatalogoIndicadores';

export default function Indicadores() {
  const [searchParams] = useSearchParams();
  const vista = searchParams.get('vista') === 'catalogo' ? 'catalogo' : 'mios';

  if (vista === 'catalogo') {
    return (
      <div className="p-6">
        <CatalogoIndicadores />
      </div>
    );
  }
  return <MisIndicadores />;
}

function MisIndicadores() {
  const [indicadores, setIndicadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarWizard, setMostrarWizard] = useState(false);

  // Mismo criterio de filtro (URL-backed) que ya usa Tablero — respaldado
  // en la URL para poder compartir/recargar sin perderlo.
  const [searchParams, setSearchParams] = useSearchParams();
  const carteraIdUrl = searchParams.get('cartera_id');
  const proyectoIdsUrl = searchParams.get('proyecto_ids');
  const filtro = {
    carteraId: carteraIdUrl || null,
    proyectoIds: carteraIdUrl ? [] : (proyectoIdsUrl ? proyectoIdsUrl.split(',').filter(Boolean) : []),
  };
  function setFiltro(next) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.delete('cartera_id');
      params.delete('proyecto_ids');
      if (next.carteraId) params.set('cartera_id', next.carteraId);
      else if (next.proyectoIds?.length) params.set('proyecto_ids', next.proyectoIds.join(','));
      return params;
    });
  }

  const [opcionesProyectos, setOpcionesProyectos] = useState([]);
  const [opcionesCarteras, setOpcionesCarteras] = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(true);

  useEffect(() => {
    Promise.all([obtenerProyectosFiltroInicio(), obtenerCarterasFiltroInicio()])
      .then(([proys, carts]) => { setOpcionesProyectos(proys); setOpcionesCarteras(carts); })
      .catch(console.error)
      .finally(() => setCargandoOpciones(false));
  }, []);

  function cargarIndicadores() {
    setCargando(true);
    return indicadoresApi.listarMios(filtro)
      .then(setIndicadores)
      .catch(console.error)
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargarIndicadores();
  }, [filtro.carteraId, filtro.proyectoIds.join(',')]);

  const grupos = {};
  for (const ind of indicadores) {
    const tipo = ind.tipo || 'Otro';
    (grupos[tipo] = grupos[tipo] || []).push(ind);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Indicadores</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Los indicadores de los proyectos donde participas, en un solo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FiltroTablero
            filtro={filtro}
            onCambiar={setFiltro}
            proyectos={opcionesProyectos}
            carteras={opcionesCarteras}
            cargando={cargandoOpciones}
          />
          <button
            onClick={() => setMostrarWizard(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-guinda-700 text-white hover:bg-guinda-600 transition-colors"
          >
            <Plus size={15} /> Vincular indicador
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Cargando indicadores…</span>
        </div>
      ) : indicadores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <BarChart3 size={36} className="opacity-30" />
          <p className="text-sm">
            {filtro.carteraId || filtro.proyectoIds.length > 0
              ? 'Ningún indicador coincide con el filtro.'
              : 'Todavía no hay indicadores en tus proyectos.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos).map(([tipo, inds]) => (
            <div key={tipo}>
              <p className="text-xs font-semibold text-gray-600 mb-2.5 uppercase tracking-wide">
                {ETIQUETA_TIPO_INDICADOR[tipo] || tipo}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agruparPorCatalogo(inds).map(grupo => (
                  <TarjetaIndicadorOAgrupada
                    key={grupo[0].id_catalogo || grupo[0].id}
                    grupo={grupo}
                    variante="normal"
                    permitirEditarValor
                    onValorActualizado={cargarIndicadores}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarWizard && (
        <ModalVincularIndicador
          proyectosDisponibles={opcionesProyectos}
          onCerrar={() => setMostrarWizard(false)}
          onVinculado={() => { setMostrarWizard(false); cargarIndicadores(); }}
        />
      )}
    </div>
  );
}
