/**
 * ARCHIVO: PestanasDetalle.jsx
 * PROPÓSITO: Subpestañas del panel de Detalle (Fase 4 del rediseño), debajo
 *            de la ficha del elemento — Actividad · Documentos(n) ·
 *            Indicadores(n) · Territorio · Riesgos(n) · Equipo y permisos(n).
 *            Documentos/Indicadores/Riesgos son tablas de consulta con su
 *            propio botón de alta (ya no botones sueltos en "Más
 *            acciones" — ver FilaAcciones.jsx); Territorio es un valor
 *            único con botón "Editar territorio"; Equipo y permisos reusa
 *            SeccionMiembrosNodo tal cual.
 *
 * Todas las pestañas con contador se montan siempre (ocultas con CSS, no
 * desmontadas) para que el número en la pestaña esté listo sin tener que
 * visitarla primero — cada una reporta su conteo hacia arriba apenas
 * termina de cargar.
 *
 * `onContador` de cada pestaña DEBE ser una referencia estable (useCallback,
 * no un arrow inline en el render). Documentos/Indicadores/Riesgos traen
 * `onContador` en las dependencias de su propio `cargar` (useCallback) —
 * con un arrow nuevo en cada render de este componente, cada actualización
 * de `contadores` (una por pestaña, la primera vez que reporta su conteo
 * real) volvía a disparar el fetch de las CUATRO pestañas con contador a
 * la vez, en cascada, cada una recolapsando su contenido a "Cargando…" y
 * restaurándolo. Con el árbol de la izquierda colapsado (columna corta)
 * y la pestaña Indicadores activa con varias filas, esa cascada de 3-4
 * ciclos — invisible en local por la latencia casi nula, pero perceptible
 * en producción — bastaba para que la altura total de la página cruzara
 * el alto del viewport varias veces seguidas, haciendo que el navegador
 * reubicara el scroll (a veces hasta arriba del todo) en cada ciclo: el
 * "vibrar" reportado en producción. Con el árbol expandido la columna
 * izquierda ya es más alta que el viewport por sí sola, así que la misma
 * cascada no cambia la altura total y no se nota — coincide exactamente
 * con la condición de reproducción reportada.
 */
import { useState, useCallback } from 'react';
import ActividadStream from '../../nodos/ActividadStream';
import PestanaDocumentos from './PestanaDocumentos';
import PestanaIndicadores from './PestanaIndicadores';
import PestanaTerritorio from './PestanaTerritorio';
import PestanaRiesgos from './PestanaRiesgos';
import SeccionMiembrosNodo from '../SeccionMiembrosNodo';

const TABS = [
  { id: 'actividad', label: 'Actividad' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'territorio', label: 'Territorio' },
  { id: 'riesgos', label: 'Riesgos' },
  { id: 'equipo', label: 'Equipo y permisos' },
];

export default function PestanasDetalle({
  tipo, id, nodo, proyectoId, permisos, permisosProyecto, onCambiado, mostrarToast,
  riesgoAAbrir, onRiesgoConsumido, onNavegarNodo,
}) {
  const [activa, setActiva] = useState(riesgoAAbrir ? 'riesgos' : 'actividad');
  const [contadores, setContadores] = useState({});

  const reportarContador = useCallback((clave, n) => {
    setContadores(prev => (prev[clave] === n ? prev : { ...prev, [clave]: n }));
  }, []);

  // Una referencia estable por pestaña (no un arrow inline en el render) —
  // ver el comentario de cabecera.
  const onContadorDocumentos = useCallback(n => reportarContador('documentos', n), [reportarContador]);
  const onContadorIndicadores = useCallback(n => reportarContador('indicadores', n), [reportarContador]);
  const onContadorRiesgos = useCallback(n => reportarContador('riesgos', n), [reportarContador]);
  const onContadorEquipo = useCallback(n => reportarContador('equipo', n), [reportarContador]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-0.5 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiva(t.id)}
            className={`px-3 py-2 text-[12px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activa === t.id ? 'border-guinda-600 text-guinda-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}{typeof contadores[t.id] === 'number' ? ` (${contadores[t.id]})` : ''}
          </button>
        ))}
      </div>

      <div className="pt-3">
        <div className={activa === 'actividad' ? '' : 'hidden'}>
          <ActividadStream
            tipo={tipo}
            id={id}
            soloLectura={permisos?.esSoloLectura}
            onCambiado={onCambiado}
            riesgoIdInicial={riesgoAAbrir}
            onRiesgoConsumido={onRiesgoConsumido}
          />
        </div>

        <div className={activa === 'documentos' ? '' : 'hidden'}>
          <PestanaDocumentos
            tipo={tipo} id={id} permisos={permisos} permisosProyecto={permisosProyecto}
            onCambiado={onCambiado} mostrarToast={mostrarToast} onNavegarNodo={onNavegarNodo}
            onContador={onContadorDocumentos}
          />
        </div>

        <div className={activa === 'indicadores' ? '' : 'hidden'}>
          <PestanaIndicadores
            tipo={tipo} id={id} nodo={nodo} proyectoId={proyectoId} permisos={permisos}
            onCambiado={onCambiado} mostrarToast={mostrarToast} onNavegarNodo={onNavegarNodo}
            onContador={onContadorIndicadores}
          />
        </div>

        <div className={activa === 'territorio' ? '' : 'hidden'}>
          <PestanaTerritorio tipo={tipo} id={id} nodo={nodo} permisos={permisos} onCambiado={onCambiado} mostrarToast={mostrarToast} />
        </div>

        <div className={activa === 'riesgos' ? '' : 'hidden'}>
          <PestanaRiesgos
            tipo={tipo} id={id} permisos={permisos} onCambiado={onCambiado} mostrarToast={mostrarToast} onNavegarNodo={onNavegarNodo}
            onContador={onContadorRiesgos}
          />
        </div>

        <div className={activa === 'equipo' ? '' : 'hidden'}>
          <SeccionMiembrosNodo
            tipo={tipo} idNodo={id} permisos={permisos} idProyecto={proyectoId} nombreNodo={nodo?.nombre}
            onContador={onContadorEquipo}
          />
        </div>
      </div>
    </div>
  );
}
