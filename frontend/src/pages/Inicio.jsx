/**
 * ARCHIVO: Inicio.jsx
 * PROPÓSITO: Concentrador de navegación — la ruta raíz ("/"), lo primero
 *            que ve cualquiera al iniciar sesión. Saludo + acción de
 *            crear proyecto + tarjetas de acceso a cada sección + un
 *            atajo discreto a la Guía de uso. NO es el dashboard de
 *            datos personalizado (eso es Tablero.jsx, en /tablero) —
 *            Inicio es orientación, Tablero es información.
 *
 * MINI-CLASE: "reusar la fuente", no reescribirla
 * ─────────────────────────────────────────────────────────────────
 * Cada tarjeta muestra un número, y ese número tiene que salir de la
 * MISMA consulta que alimenta la pantalla a la que lleva — nunca de una
 * consulta nueva que recalcule "lo mismo" con otro criterio. Así fue
 * exactamente como una ronda anterior terminó con una tarjeta que decía
 * "7 actividades / 5 vencidas" llevando a una pantalla que mostraba
 * "25 / 22": dos consultas distintas calculando, en apariencia, la misma
 * cosa. Por eso:
 *   - proyectos_visibles/proyectos_sigue/indicadores_visibles/
 *     estados_con_actividad vienen de GET /inicio/resumen-tarjetas, cuyas
 *     4 consultas (inicio.controller.js) son la MISMA consulta (o un
 *     COUNT de ella) que ya usan Seguimiento de proyectos, Tablero
 *     General, Indicadores y Territorio respectivamente.
 *   - "Mis actividades" NO viene de ese endpoint: su cifra depende de la
 *     ventana de periodo (igual que MisActividades.jsx, que abre en
 *     "Mes" por omisión), así que se calcula sobre los MISMOS datos que
 *     trae GET /agenda, con la MISMA función pura
 *     (utils/resumenMisActividades.js) que usa esa pantalla. La petición
 *     a /agenda y el cálculo viven en Layout.jsx (useMisPendientes),
 *     NO aquí: el badge de "Mis actividades" del sidebar necesita lo
 *     mismo, y pedirlo por separado en cada componente duplicaba la
 *     llamada a /agenda cada vez que se cargaba el Inicio. Esta pantalla
 *     solo LEE `misActividadesResumen` del Outlet context — mismo patrón
 *     que `notificacionesSinLeer` un poco más abajo.
 *   - "Notificaciones" tampoco viene de ese endpoint: usa el mismo
 *     `total` combinado (no leídas + invitaciones + solicitudes +
 *     asignaciones de riesgo) que ya expone la campanita del Header/
 *     Sidebar vía el Outlet context (useCentroNotificaciones, pedido una
 *     sola vez en Layout.jsx) — es la MISMA cifra que ya ve la persona en
 *     el badge, por eso aquí se rotula "pendientes" (como el prop
 *     `pendientesNotificaciones` de Sidebar.jsx) y no "sin leer": la
 *     pantalla de Notificaciones sí tiene un "sin leer" puro y más chico
 *     (otro hook, otro endpoint), y llamarle igual a dos números
 *     distintos es el mismo problema de fondo que el bloque 1 vino a
 *     corregir en los otros cinco.
 *
 * MINI-CLASE: equilibrio visual — una acción arriba, un atajo abajo
 * ─────────────────────────────────────────────────────────────────
 * Antes "Da de alta un proyecto" y "Guía de uso" eran dos franjas
 * punteadas del mismo tamaño, una debajo de otra, al fondo de la
 * pantalla — se leían como dos tarjetas más, pesadas y redundantes
 * entre sí. Ahora cada una vive donde la convención del resto de la
 * plataforma ya la pone: "Nuevo proyecto" es un btn-primary en la
 * esquina superior derecha, igual que en ListadoProyectos.jsx; "Guía de
 * uso" es un link chico en la esquina inferior derecha, eco del mismo
 * rótulo que ya vive al pie de la barra lateral — no necesita repetir
 * la explicación completa, solo ser reconocible.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  FolderKanban, ListChecks, LayoutDashboard, BarChart3, Map as MapIcon, Bell,
  Plus, BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermisosGlobales } from '../hooks/usePermisos';
import { obtenerResumenTarjetasInicio } from '../api/inicio';
import FichaSeccion from '../components/common/FichaSeccion';

export default function Inicio() {
  const { usuario } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const {
    notificacionesSinLeer = 0,
    misActividadesResumen: resumenActividades = null,
    cargandoMisActividades: cargandoActividades = true,
  } = useOutletContext() || {};

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
    <div className="space-y-6">
      {/* ═══ BIENVENIDA + ACCIÓN PRINCIPAL ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            Buen día, {usuario?.nombre_completo?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-sm text-gray-600 mt-3 max-w-xl leading-relaxed">
            Aquí registras tus Proyectos Prioritarios y del Ramo 15, das seguimiento a su avance
            y mantienes su información al día.
          </p>
        </div>
        {/* Mismo botón (clase, ícono, texto) que ya usa ListadoProyectos.jsx
            para la misma acción — una sola convención de "crear proyecto"
            en toda la plataforma. Oculto por completo si el rol no puede
            crear proyectos, no solo deshabilitado. */}
        {puedeCrearProyecto && (
          <Link to="/proyectos/nuevo" className="btn-primary flex items-center gap-2 flex-shrink-0 rounded-md">
            <Plus size={16} />
            Nuevo proyecto
          </Link>
        )}
      </div>

      {/* ═══ TARJETAS DE ACCESO ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <FichaSeccion
          to="/proyectos"
          icono={FolderKanban}
          color="guinda"
          titulo="Seguimiento de proyectos"
          descripcion="Actualiza el avance de tus proyectos."
          puntos={['Registra avance', 'Sube documentos', 'Vincula territorio', 'Vincula indicadores', 'Reporta riesgos']}
          cargandoContadores={cargandoTarjetas}
          contadores={tarjetas && <Cifra n={tarjetas.proyectos_visibles} unidad={tarjetas.proyectos_visibles === 1 ? 'proyecto' : 'proyectos'} resto="que puedes consultar" />}
        />
        <FichaSeccion
          to="/mis-actividades"
          icono={ListChecks}
          color="guinda"
          titulo="Mis actividades"
          descripcion="Lo que tienes pendiente, con fecha y semáforo."
          puntos={['Marca tu avance', 'Revisa qué vence pronto', 'Filtra por estado', 'Filtra por periodo']}
          cargandoContadores={cargandoActividades}
          contadores={resumenActividades && (
            <>
              <Cifra n={resumenActividades.total} unidad={resumenActividades.total === 1 ? 'actividad' : 'actividades'} resto="a tu cargo" />
              {resumenActividades.vencidas > 0 && (
                <span className="text-red-600 font-semibold"> · {plural(resumenActividades.vencidas, 'vencida', 'vencidas')}</span>
              )}
            </>
          )}
        />
        <FichaSeccion
          to="/tablero"
          icono={LayoutDashboard}
          color="dorado"
          titulo="Tablero General"
          descripcion="El avance de tus proyectos, de un vistazo."
          puntos={['Revisa tu avance general', 'Consulta riesgos abiertos', 'Revisa tus indicadores', 'Ubica tus proyectos en el mapa']}
          cargandoContadores={cargandoTarjetas}
          contadores={tarjetas && <Cifra n={tarjetas.proyectos_sigue} unidad={tarjetas.proyectos_sigue === 1 ? 'proyecto' : 'proyectos'} resto="que sigues" />}
        />
        <FichaSeccion
          to="/indicadores"
          icono={BarChart3}
          color="dorado"
          titulo="Indicadores"
          descripcion="Mide los resultados de tus proyectos."
          puntos={['Captura metas', 'Registra resultados', 'Compara entre tus proyectos', 'Consulta el catálogo']}
          cargandoContadores={cargandoTarjetas}
          contadores={tarjetas && <Cifra n={tarjetas.indicadores_visibles} unidad={tarjetas.indicadores_visibles === 1 ? 'indicador' : 'indicadores'} />}
        />
        <FichaSeccion
          to="/mapa"
          icono={MapIcon}
          color="dorado"
          titulo="Territorio"
          descripcion="Ubica en el mapa dónde están tus proyectos."
          puntos={['Consulta cobertura por estado', 'Explora por municipio', 'Filtra por proyecto', 'Revisa avance en el mapa']}
          cargandoContadores={cargandoTarjetas}
          contadores={tarjetas && <Cifra n={tarjetas.estados_con_actividad} unidad={tarjetas.estados_con_actividad === 1 ? 'estado con actividad' : 'estados con actividad'} />}
        />
        <FichaSeccion
          to="/notificaciones"
          icono={Bell}
          color="guinda"
          titulo="Notificaciones"
          descripcion="Avisos, solicitudes y cambios en lo que sigues."
          puntos={['Responde invitaciones', 'Revisa solicitudes pendientes', 'Consulta avisos', 'Revisa tu historial']}
          cargandoContadores={false}
          contadores={<Cifra n={notificacionesSinLeer} unidad={notificacionesSinLeer === 1 ? 'pendiente' : 'pendientes'} />}
        />
      </div>

      {/* ═══ ATAJO A LA GUÍA DE USO ═══ */}
      <div className="flex justify-end">
        <Link
          to="/guia-de-uso"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-guinda-600 transition-colors"
        >
          <BookOpen size={14} />
          Guía de uso
        </Link>
      </div>
    </div>
  );
}

// El número en peso fuerte y color de tinta principal (lo que la gente
// viene a leer), el resto de la frase en el gris secundario que ya trae
// el contenedor de <FichaSeccion> — así el ojo va directo a la cifra sin
// que la tarjeta se vuelva un bloque de texto gris uniforme.
function Cifra({ n, unidad, resto }) {
  return (
    <>
      <span className="font-semibold text-gray-900">{n}</span> {unidad}{resto ? ` ${resto}` : ''}
    </>
  );
}
