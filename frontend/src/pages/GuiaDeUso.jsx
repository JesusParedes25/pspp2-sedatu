/**
 * ARCHIVO: GuiaDeUso.jsx
 * PROPÓSITO: Ruta /guia-de-uso — la explicación completa de cómo
 *            funciona el seguimiento, en tres partes. Reemplaza la
 *            sección desplegable "Cómo funciona el seguimiento" que
 *            vivía en Inicio.jsx: su contenido crecía (dos diagramas,
 *            permisos, y qué se puede hacer en cada actividad) y ya no
 *            cabía ahí ni en un modal (bloque 3 de "PSPP v2.0 · Inicio,
 *            color y la guía de uso"). Se llega aquí desde la franja al
 *            final de Inicio o desde "Guía de uso" al pie de la barra
 *            lateral.
 *
 * Cada parte reusa texto/componentes ya escritos y verificados en vez de
 * redactar copias nuevas (el mismo principio del bloque 1 para las
 * cifras de Inicio, aplicado aquí al texto):
 *   - Parte 1: los 6 puntos que antes vivían en Inicio.jsx, tal cual, más
 *     el diagrama de jerarquía y la leyenda real del semáforo
 *     (LeyendaSemaforo — el mismo componente de toda la plataforma).
 *   - Parte 2: el texto de Configuración > Visibilidad y acceso
 *     (TextoVisibilidadAcceso, extraído de ConfiguracionProyecto.jsx para
 *     que las dos pantallas nunca digan cosas distintas del mismo
 *     permiso) más el diagrama de herencia de permisos.
 *   - Parte 3: la tabla de qué puede hacer cada permiso en cada
 *     actividad, verificada renglón por renglón contra
 *     backend/src/utils/autorizacion.js.
 */
import { GitBranch, ShieldCheck, Table2 } from 'lucide-react';
import LeyendaSemaforo from '../components/common/LeyendaSemaforo';
import TextoVisibilidadAcceso from '../components/common/TextoVisibilidadAcceso';
import DiagramaJerarquia from '../components/inicio/DiagramaJerarquia';
import DiagramaHerenciaPermisos from '../components/inicio/DiagramaHerenciaPermisos';
import TablaPermisosPorActividad from '../components/inicio/TablaPermisosPorActividad';

function Parte({ numero, titulo, icono: Icono, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-guinda-50 text-guinda-600 flex items-center justify-center flex-shrink-0">
          <Icono size={18} />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Parte {numero}</p>
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function GuiaDeUso() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Guía de uso</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cómo se organiza el trabajo, quién puede hacer qué, y qué puedes hacer en cada actividad.</p>
      </div>

      <Parte numero={1} titulo="Cómo se organiza el trabajo" icono={GitBranch}>
        <div className="flex flex-col lg:flex-row gap-x-8 gap-y-6">
          <ol className="lg:flex-1 min-w-0 space-y-3 text-sm text-gray-700 leading-relaxed list-decimal list-inside">
            <li>Cada proyecto se divide en etapas, cada etapa en acciones, y cada acción en tareas.</li>
            <li>Registras el avance en lo más pequeño que tengas asignado. El avance sube solo hasta el proyecto: no hay que actualizarlo en cada nivel.</li>
            <li>Cada actividad tiene un estado que tú declaras: sin iniciar, en proceso, bloqueada, completada o cancelada.</li>
            <li>Y un semáforo que la plataforma calcula sola a partir de la fecha límite: en tiempo, por vencer, vencida, o sin urgencia cuando falta capturar la fecha.</li>
            <li>En Mis actividades ves únicamente lo que te toca a ti. En Seguimiento de proyectos ves todo lo de la Secretaría, aunque solo puedas editar aquello en lo que participas.</li>
            <li>Puedes delegar una etapa, una acción o una tarea en otra persona. Lo que delegues aparece en las actividades de quien lo recibe.</li>
          </ol>
          <div className="lg:w-[340px] lg:flex-shrink-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Ejemplo: PTO de Manzanillo</p>
            <DiagramaJerarquia />
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">El semáforo</p>
          <LeyendaSemaforo />
        </div>
      </Parte>

      <Parte numero={2} titulo="Quién puede hacer qué" icono={ShieldCheck}>
        <div className="flex flex-col lg:flex-row gap-x-8 gap-y-6">
          <div className="lg:flex-1 min-w-0">
            <TextoVisibilidadAcceso />
          </div>
          <div className="lg:w-[340px] lg:flex-shrink-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">La herencia de permisos</p>
            <DiagramaHerenciaPermisos />
          </div>
        </div>
      </Parte>

      <Parte numero={3} titulo="Qué puedes hacer en cada actividad" icono={Table2}>
        <TablaPermisosPorActividad />
      </Parte>
    </div>
  );
}
