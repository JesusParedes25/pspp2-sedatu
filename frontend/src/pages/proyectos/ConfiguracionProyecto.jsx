/**
 * ARCHIVO: ConfiguracionProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/configuracion — sección nueva de la
 *            Fase 2 del rediseño de navegación. Sub-navegación vertical
 *            con 5 apartados: Equipo y permisos, Datos generales,
 *            Indicadores vinculados, Visibilidad y acceso, Plantilla y
 *            estructura.
 *
 * Reusa deliberadamente lo que ya existe en vez de duplicar lógica:
 * - Equipo y permisos: GestorUsuariosProyecto (extraído de Panorama).
 * - Datos generales / Indicadores vinculados: el mismo ModalEditarProyecto
 *   que ya vive en el encabezado — edita ambas cosas a la vez, no hace
 *   falta un formulario paralelo.
 * - Plantilla y estructura: el mismo ModalDuplicarProyecto que antes
 *   vivía suelto en el encabezado.
 *
 * "Zona de riesgo" (Archivar / Transferir responsable) existió aquí como
 * apartado sin acción funcional (ninguna de las dos operaciones existe
 * en el modelo de datos) — se quitó por pedido explícito del usuario, no
 * por confundirse con la sección nueva de Riesgos del proyecto
 * (/proyectos/:id/riesgos, RiesgosProyecto.jsx), que es un concepto
 * completamente distinto (riesgos/problemas del trabajo, no "operaciones
 * delicadas sobre el proyecto").
 */
import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Users, FileText, Target, Eye, Copy, Pencil, Loader2,
} from 'lucide-react';
import GestorUsuariosProyecto from '../../components/proyectos/GestorUsuariosProyecto';
import ModalEditarProyecto from '../../components/proyectos/ModalEditarProyecto';
import ModalDuplicarProyecto from '../../components/proyectos/ModalDuplicarProyecto';
import { useUI } from '../../context/UIContext';
import { usePermisosGlobales } from '../../hooks/usePermisos';
import * as indicadoresApi from '../../api/indicadores';

const APARTADOS = [
  { id: 'equipo', etiqueta: 'Equipo y permisos', icono: Users },
  { id: 'datos', etiqueta: 'Datos generales', icono: FileText },
  { id: 'indicadores', etiqueta: 'Indicadores vinculados', icono: Target },
  { id: 'visibilidad', etiqueta: 'Visibilidad y acceso', icono: Eye },
  { id: 'plantilla', etiqueta: 'Plantilla y estructura', icono: Copy },
];

function Tarjeta({ titulo, descripcion, accion, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
          {descripcion && <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>}
        </div>
        {accion}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CampoDato({ etiqueta, valor }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400 uppercase tracking-wide">{etiqueta}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{valor || <span className="text-gray-300">Sin capturar</span>}</dd>
    </div>
  );
}

export default function ConfiguracionProyecto() {
  const { proyecto, proyectoId, permisos, recargarProyecto, incrementarStats } = useOutletContext();
  const { mostrarToast } = useUI();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const [searchParams, setSearchParams] = useSearchParams();
  const abrirInvitar = searchParams.get('invitar') === '1';
  const [apartado, setApartado] = useState('equipo');
  const [modalEditar, setModalEditar] = useState(false);
  const [modalDuplicar, setModalDuplicar] = useState(false);

  // Atajo "Invitar persona" de la Portada: fuerza el apartado "Equipo y
  // permisos" y limpia el query param al consumirlo (no reabrir el
  // modal en cada re-render ni al volver con el botón atrás).
  useEffect(() => {
    if (abrirInvitar) {
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('invitar'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [indicadores, setIndicadores] = useState(null);
  useEffect(() => {
    if (apartado !== 'indicadores' || !proyectoId) return;
    indicadoresApi.listarTodosPorProyecto(proyectoId).then(setIndicadores).catch(() => setIndicadores([]));
  }, [apartado, proyectoId]);

  return (
    <div className="flex gap-6 items-start">
      {/* Sub-navegación vertical */}
      <nav className="w-52 flex-shrink-0 space-y-0.5" aria-label="Apartados de configuración">
        {APARTADOS.map(a => (
          <button
            key={a.id}
            onClick={() => setApartado(a.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-guinda-300 ${
              apartado === a.id ? 'bg-guinda-50 text-guinda-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
            aria-current={apartado === a.id ? 'page' : undefined}
          >
            <a.icono size={15} />
            {a.etiqueta}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0 space-y-4">
        {apartado === 'equipo' && (
          <GestorUsuariosProyecto proyecto={proyecto} proyectoId={proyectoId} abrirInvitarAlMontar={abrirInvitar} />
        )}

        {apartado === 'datos' && (
          <Tarjeta
            titulo="Datos generales"
            descripcion="Nombre, descripción, dependencia, tipo, estatus y fechas del proyecto."
            accion={permisos.puedeEditar && (
              <button onClick={() => setModalEditar(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Pencil size={14} /> Editar
              </button>
            )}
          >
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CampoDato etiqueta="Nombre" valor={proyecto.nombre} />
              <CampoDato etiqueta="Tipo" valor={proyecto.tipo?.replace(/_/g, ' ')} />
              <CampoDato etiqueta="Dependencia" valor={`${proyecto.dg_lider_siglas || ''}${proyecto.direccion_area_lider_siglas ? ` / ${proyecto.direccion_area_lider_siglas}` : ''}` || null} />
              <CampoDato etiqueta="Programa" valor={proyecto.programa_clave} />
              <CampoDato etiqueta="Fecha de inicio" valor={proyecto.fecha_inicio?.slice(0, 10)} />
              <CampoDato etiqueta="Fecha límite" valor={proyecto.fecha_limite?.slice(0, 10)} />
              <div className="sm:col-span-2">
                <CampoDato etiqueta="Descripción" valor={proyecto.descripcion} />
              </div>
            </dl>
          </Tarjeta>
        )}

        {apartado === 'indicadores' && (
          <Tarjeta
            titulo="Indicadores vinculados"
            descripcion="Qué indicadores del catálogo mide este proyecto. Vincular, desvincular y editar metas se hace desde “Editar”: la captura de valores sigue viviendo en Seguimiento."
            accion={permisos.puedeEditar && (
              <button onClick={() => setModalEditar(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Pencil size={14} /> Editar
              </button>
            )}
          >
            {indicadores === null ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-guinda-600" /></div>
            ) : indicadores.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Este proyecto no tiene indicadores vinculados todavía.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {indicadores.map(ind => (
                  <li key={ind.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{ind.nombre}</p>
                      <p className="text-xs text-gray-400">{ind.tipo} · Meta: {ind.meta_global ?? '-'} {ind.unidad}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}

        {apartado === 'visibilidad' && (
          <Tarjeta
            titulo="Visibilidad y acceso"
            descripcion="Quién puede ver, capturar, importar y exportar en este proyecto."
          >
            <ul className="space-y-4 text-sm text-gray-700">
              <li>
                <span className="font-medium">Quién ve este proyecto:</span>{' '}
                cualquier persona con cuenta dentro de la Secretaría puede verlo, participe en él o no. La única
                excepción es una persona externa a la Secretaría: esa solo ve los proyectos a los que fue invitada.
              </li>
              <li>
                <span className="font-medium">Qué puede hacer cada quien</span> depende de su permiso en cada parte del proyecto:
                <ul className="mt-1.5 space-y-1 list-disc pl-5 text-gray-600">
                  <li><span className="font-medium text-gray-700">Solo lectura:</span> consulta, sin cambiar nada.</li>
                  <li><span className="font-medium text-gray-700">Colaborador:</span> además registra avance, sube documentos, comenta y da seguimiento a riesgos e indicadores.</li>
                  <li><span className="font-medium text-gray-700">Responsable:</span> además edita la ficha, crea y elimina etapas, acciones y tareas, e invita, retira o cambia la función de otras personas.</li>
                  <li><span className="font-medium text-gray-700">Administrador:</span> tiene Responsable sobre todo el proyecto, y además edita su ficha general y puede eliminarlo. Solo existe a nivel de todo el proyecto, nunca sobre una sola etapa o acción.</li>
                </ul>
                Cada permiso incluye lo que puede hacer el anterior.
              </li>
              <li>
                <span className="font-medium">El permiso se hereda hacia abajo, nunca hacia arriba:</span>{' '}
                si te invitaron como Responsable de una etapa, lo eres también en sus acciones y tareas. Lo contrario
                no pasa: ser Colaborador de una tarea no te da ningún permiso sobre su acción, su etapa o el proyecto.
              </li>
              <li>
                <span className="font-medium">Lo que no puedes editar, igual lo puedes leer:</span>{' '}
                una parte del proyecto donde no tienes permiso de captura se ve atenuada, con un candado, nunca
                oculta. Su contenido se puede leer completo; solo no se puede cambiar.
              </li>
              <li>
                <span className="font-medium">Importar y exportar:</span>{' '}
                exportar la estructura del proyecto solo exige poder verlo, igual que abrirlo. Importar sí exige ser,
                al menos, Colaborador.
              </li>
              <li>
                Si tu perfil es de Dirección, tus listados personalizados (Tablero, mapas, indicadores) también
                incluyen los proyectos que lidera tu Dirección General, aunque no participes en ellos; eso no
                cambia nada sobre este proyecto en particular: ya lo puedes ver, por la primera regla de arriba.
              </li>
            </ul>
          </Tarjeta>
        )}

        {apartado === 'plantilla' && (
          <Tarjeta
            titulo="Plantilla y estructura"
            descripcion="Crea un proyecto nuevo copiando la estructura de este (etapas, acciones, indicadores)."
          >
            {puedeCrearProyecto ? (
              <button onClick={() => setModalDuplicar(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Copy size={14} /> Duplicar este proyecto
              </button>
            ) : (
              <p className="text-xs text-gray-400">No tienes permiso para crear proyectos nuevos.</p>
            )}
          </Tarjeta>
        )}

      </div>

      {modalEditar && (
        <ModalEditarProyecto
          proyecto={proyecto}
          onCerrar={() => setModalEditar(false)}
          onGuardado={() => {
            mostrarToast('Proyecto actualizado', 'exito');
            recargarProyecto();
            incrementarStats();
            if (apartado === 'indicadores') indicadoresApi.listarTodosPorProyecto(proyectoId).then(setIndicadores).catch(() => {});
          }}
        />
      )}

      {modalDuplicar && (
        <ModalDuplicarProyecto
          proyectoOrigen={proyecto}
          onCerrar={() => setModalDuplicar(false)}
          mostrarToast={mostrarToast}
          onDuplicado={() => setModalDuplicar(false)}
        />
      )}
    </div>
  );
}
