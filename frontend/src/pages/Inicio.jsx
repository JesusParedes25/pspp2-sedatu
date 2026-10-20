/**
 * ARCHIVO: Inicio.jsx
 * PROPÓSITO: Concentrador de navegación — la ruta raíz ("/"), lo primero
 *            que ve cualquiera al iniciar sesión. Saludo + tarjetas de
 *            acceso a cada sección + una explicación breve de cómo
 *            funciona el seguimiento. NO es el dashboard de datos
 *            personalizado (eso es Tablero.jsx, en /tablero) — Inicio es
 *            orientación, Tablero es información. Ver "PSPP v2.0 ·
 *            Pantalla de Inicio" para el encargo completo.
 */
import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  FolderKanban, ListChecks, LayoutDashboard, BarChart3, Map as MapIcon, Bell,
  PlusCircle, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermisosGlobales } from '../hooks/usePermisos';
import { obtenerResumenTarjetasInicio } from '../api/inicio';
import FichaSeccion from '../components/common/FichaSeccion';
import LeyendaSemaforo from '../components/common/LeyendaSemaforo';
import DiagramaJerarquia from '../components/inicio/DiagramaJerarquia';

// Preferencia de "¿la sección Cómo funciona el seguimiento está
// abierta?", guardada por usuario (ver SeccionComoFunciona más abajo).
const CLAVE_COMO_FUNCIONA = 'pspp_inicio_como_funciona_abierto';

// React.StrictMode llama DOS VECES, de forma sincrónica y seguida, al
// inicializador de useState (a propósito, para detectar inicializadores
// impuros) — sin este caché, la segunda llamada leería el '0' que la
// primera acababa de escribir y la sección nunca se vería abierta, ni
// siquiera en la primera visita real. Por eso se cachea la DECISIÓN
// completa (no solo "ya se escribió"), y el caché se borra en un
// microtask: sobrevive a esa doble llamada sincrónica de StrictMode,
// pero no a un remontaje real más adelante (navegar a otra pantalla y
// volver), que sí debe releer el valor actual de localStorage —
// por ejemplo, si la persona cerró la sección a mano en esa primera
// visita.
const decisionesRecientes = new Map();

function leerPreferenciaInicial(usuarioId) {
  if (!usuarioId) return true;
  const clave = `${CLAVE_COMO_FUNCIONA}_${usuarioId}`;
  if (decisionesRecientes.has(clave)) return decisionesRecientes.get(clave);

  let resultado = true;
  try {
    const guardado = localStorage.getItem(clave);
    if (guardado !== null) {
      resultado = guardado === '1';
    } else {
      localStorage.setItem(clave, '0');
    }
  } catch {
    resultado = true;
  }

  decisionesRecientes.set(clave, resultado);
  queueMicrotask(() => decisionesRecientes.delete(clave));
  return resultado;
}

export default function Inicio() {
  const { usuario } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const { notificacionesSinLeer = 0 } = useOutletContext() || {};

  const [tarjetas, setTarjetas] = useState(null);
  const [cargandoTarjetas, setCargandoTarjetas] = useState(true);

  useEffect(() => {
    let vigente = true;
    obtenerResumenTarjetasInicio()
      .then(datos => { if (vigente) setTarjetas(datos); })
      .catch(() => { if (vigente) setTarjetas(null); })
      .finally(() => { if (vigente) setCargandoTarjetas(false); });
    return () => { vigente = false; };
  }, []);

  const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;

  return (
    <div className="space-y-8">
      {/* ═══ BLOQUE 2 · BIENVENIDA ═══ */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Buen día, {usuario?.nombre_completo?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <p className="text-sm text-gray-600 mt-3 max-w-2xl leading-relaxed">
          Aquí registras proyectos y su avance, delegas actividades, y concentras en un solo lugar
          el seguimiento de los proyectos de tu Dirección de Área o Dirección General.
        </p>
      </div>

      {/* ═══ BLOQUE 3 · TARJETAS DE ACCESO ═══ */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <FichaSeccion
            to="/proyectos"
            icono={FolderKanban}
            titulo="Seguimiento de proyectos"
            descripcion="Consulta y actualiza los proyectos de la Secretaría."
            cargandoContadores={cargandoTarjetas}
            contadores={tarjetas && plural(tarjetas.proyectos_visibles, 'proyecto', 'proyectos')}
            destacada
          />
          <FichaSeccion
            to="/mis-actividades"
            icono={ListChecks}
            titulo="Mis actividades"
            descripcion="Lo que te toca a ti: etapas, acciones y tareas asignadas."
            cargandoContadores={cargandoTarjetas}
            contadores={tarjetas && (
              <>{plural(tarjetas.mis_actividades_total, 'actividad', 'actividades')} a tu cargo
                {tarjetas.mis_actividades_vencidas > 0 && (
                  <span className="text-red-500 font-medium"> · {plural(tarjetas.mis_actividades_vencidas, 'vencida', 'vencidas')}</span>
                )}
              </>
            )}
          />
          <FichaSeccion
            to="/tablero"
            icono={LayoutDashboard}
            titulo="Tablero"
            descripcion="El avance de tus proyectos, su territorio y sus indicadores."
            cargandoContadores={cargandoTarjetas}
            contadores={tarjetas && plural(tarjetas.proyectos_sigue, 'proyecto', 'proyectos')}
          />
          <FichaSeccion
            to="/indicadores"
            icono={BarChart3}
            titulo="Indicadores"
            descripcion="Mide resultados con cifras comparables entre proyectos."
            cargandoContadores={cargandoTarjetas}
            contadores={tarjetas && plural(tarjetas.indicadores_visibles, 'indicador', 'indicadores')}
          />
          <FichaSeccion
            to="/mapa"
            icono={MapIcon}
            titulo="Territorio"
            descripcion="Ubica en el mapa dónde está ocurriendo cada proyecto."
            cargandoContadores={cargandoTarjetas}
            contadores={tarjetas && plural(tarjetas.estados_con_actividad, 'estado con actividad', 'estados con actividad')}
          />
          <FichaSeccion
            to="/notificaciones"
            icono={Bell}
            titulo="Notificaciones"
            descripcion="Avisos, solicitudes y cambios en lo que sigues."
            cargandoContadores={false}
            contadores={plural(notificacionesSinLeer, 'sin leer', 'sin leer')}
          />
        </div>

        {/* "Nuevo proyecto" es una acción, no una sección: tratamiento
            visual distinto (borde punteado, sin "Dato:") y al final, para
            que no se lea como una sexta tarjeta de la misma fila. Oculta
            por completo si el rol no puede crear proyectos — una tarjeta
            que lleva a "no tienes permiso" es peor que no tenerla. */}
        {puedeCrearProyecto && (
          <Link
            to="/proyectos/nuevo"
            className="mt-3.5 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-3.5 text-sm font-medium text-gray-500 hover:border-guinda-300 hover:text-guinda-600 hover:bg-guinda-50/40 transition-colors"
          >
            <PlusCircle size={18} />
            Da de alta un proyecto y define sus etapas
          </Link>
        )}
      </div>

      {/* ═══ BLOQUE 4 · CÓMO FUNCIONA EL SEGUIMIENTO ═══ */}
      <SeccionComoFunciona usuarioId={usuario?.id} />
    </div>
  );
}

function SeccionComoFunciona({ usuarioId }) {
  // Abierta la primera vez que esta persona entra, cerrada a partir de
  // entonces — sin valor guardado todavía, se muestra abierta ESTA vez
  // pero se guarda de inmediato "cerrada" como preferencia para las
  // siguientes visitas. Si la persona la vuelve a abrir a mano, ese clic
  // sí se recuerda (abierta la próxima vez) hasta que la cierre de nuevo:
  // es la preferencia real de la persona, no un mensaje que se repite
  // una sola vez y ya. Si la lectura de localStorage falla (modo
  // privado, storage bloqueado), se queda abierta: mejor mostrar de más
  // que esconder la explicación por un error técnico.
  //
  // El cálculo va en el inicializador de useState (lectura síncrona),
  // NO en un useEffect: un efecto que lee el storage y luego escribe un
  // valor por defecto dentro de sí mismo dejaba de verse "primera vez"
  // bajo React.StrictMode (desarrollo), porque StrictMode desmonta y
  // vuelve a montar el componente a propósito para detectar justo este
  // tipo de efecto no-idempotente — el segundo montaje leía el '0' que
  // el primero acababa de escribir, y la sección nunca se veía abierta
  // ni siquiera en la primera visita real. `clavesYaInicializadas`
  // (fuera del componente, sobrevive a ese remontaje simulado porque es
  // una sola evaluación del módulo por carga de página) evita que ese
  // remontaje repita la escritura y vuelva a leerla.
  const [abierto, setAbierto] = useState(() => leerPreferenciaInicial(usuarioId));

  function alternar() {
    setAbierto(prev => {
      const siguiente = !prev;
      if (usuarioId) {
        try { localStorage.setItem(`${CLAVE_COMO_FUNCIONA}_${usuarioId}`, siguiente ? '1' : '0'); } catch { /* no-op: sin persistencia disponible */ }
      }
      return siguiente;
    });
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={alternar}
        className="w-full flex items-center justify-between gap-2 px-5 py-3.5 text-left hover:bg-gray-50/70 transition-colors"
        aria-expanded={abierto}
      >
        <h2 className="text-sm font-semibold text-gray-800">Cómo funciona el seguimiento</h2>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="px-5 pb-6 pt-1 border-t border-gray-100">
          <div className="w-full flex flex-col lg:flex-row gap-x-8 gap-y-6 lg:items-start">
            <ol className="w-full lg:flex-1 min-w-0 space-y-3 text-sm text-gray-700 leading-relaxed list-decimal list-inside">
              <li>Cada proyecto se divide en etapas, cada etapa en acciones, y cada acción en tareas.</li>
              <li>Registras el avance en lo más pequeño que tengas asignado. El avance sube solo hasta el proyecto: no hay que actualizarlo en cada nivel.</li>
              <li>Cada actividad tiene un estado que tú declaras: sin iniciar, en proceso, bloqueada, completada o cancelada.</li>
              <li>Y un semáforo que la plataforma calcula sola a partir de la fecha límite: en tiempo, por vencer, vencida, o sin urgencia cuando falta capturar la fecha.</li>
              <li>En Mis actividades ves únicamente lo que te toca a ti. En Seguimiento de proyectos ves todo lo de la Secretaría, aunque solo puedas editar aquello en lo que participas.</li>
              <li>Puedes delegar una etapa, una acción o una tarea en otra persona. Lo que delegues aparece en las actividades de quien lo recibe.</li>
            </ol>

            <div className="w-full lg:w-[300px] lg:flex-shrink-0 flex flex-col gap-6">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 text-center lg:text-left">La jerarquía</p>
                <DiagramaJerarquia />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">El semáforo</p>
                <LeyendaSemaforo />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
