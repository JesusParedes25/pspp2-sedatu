/**
 * ARCHIVO: VistaLista.jsx
 * PROPÓSITO: DataGrid editable con TanStack Table para seguimiento en vista lista.
 *
 * - Jerarquía completa: etapa → acción → subacción/tarea → tarea (de la
 *   subacción), con indentación e ícono por nivel — no solo etapa+acción.
 * - Columnas fijas: semáforo, nombre, estado, fecha_inicio, fecha_fin, %,
 *   Registrar avance
 * - Columnas dinámicas: generadas desde campos_extra JSONB del proyecto
 *   (no aplica a tareas: esa tabla no tiene columna campos_extra)
 * - Inline editing: click en celda → input/select → PATCH al backend
 * - Registrar avance: mismo modal que usan Detalle y Diagrama, para poder
 *   reportar avance sin salir de la tabla
 * - Estética institucional: grises oscuros, rojos profundos, minimalist
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ArrowUpDown, SlidersHorizontal, MapPin, Layers, Target, CheckSquare, TrendingUp } from 'lucide-react';
import client from '../../api/client';
import * as etapasApi from '../../api/etapas';
import SemaforoDot from '../common/SemaforoDot';
import SelectorEstado from '../common/SelectorEstado';
import ModalRegistrarAvance from '../nodos/ModalRegistrarAvance';
import { formatFecha } from '../../utils/fecha';

// dd/mm/aaaa — formato compacto para columnas angostas de la tabla
const formatFechaCorta = (valor) => formatFecha(valor, { day: '2-digit', month: '2-digit', year: 'numeric' });

// Ícono por nivel — mismo criterio que config/niveles.js (Etapa/Acción/
// Tarea), pero en un tono neutro: el color de nivel y el de estatus
// (SemaforoDot, en su propia columna) nunca se combinan en el mismo
// elemento, para que cada señal se lea aparte de un vistazo.
const ICONO_TIPO = { etapa: Layers, accion: Target, tarea: CheckSquare };

// Indentación por profundidad: 0 etapa · 1 acción · 2 subacción/tarea-de-
// acción · 3 tarea-de-subacción.
const INDENT_NIVEL = ['pl-1', 'pl-5', 'pl-9', 'pl-14'];

// ─── Celda editable ───────────────────────────────────────────
// formatoDisplay: formatea el valor solo para la vista de solo-lectura
// (ej. ISO → dd/mm/aaaa); el input de edición sigue usando el valor crudo,
// que es lo que espera el backend al guardar.
function CeldaEditable({ getValue, row, column, table, formatoDisplay }) {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue ?? '');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setValue(initialValue ?? ''); }, [initialValue]);

  const onBlur = () => {
    setEditing(false);
    if (value !== (initialValue ?? '')) {
      table.options.meta?.actualizarCelda(row.original, column.id, value);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { setValue(initialValue ?? ''); setEditing(false); }
  };

  if (!editing) {
    const textoMostrado = value ? (formatoDisplay ? (formatoDisplay(value) || value) : value) : '';
    return (
      <div
        className="px-2 py-1 cursor-pointer hover:bg-red-50 rounded min-h-[28px] text-sm truncate"
        onClick={() => setEditing(true)}
        title={String(textoMostrado || '')}
      >
        {textoMostrado || <span className="text-gray-300">—</span>}
      </div>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="w-full px-2 py-1 text-sm border border-red-300 rounded focus:ring-1 focus:ring-red-500 outline-none"
    />
  );
}

// ─── Celda de nombre: ícono de nivel + indentación + texto editable ────
function CeldaNombre(props) {
  const { nivel, tipo } = props.row.original;
  const Icono = ICONO_TIPO[tipo] || Target;
  return (
    <div className={`flex items-center gap-1.5 ${INDENT_NIVEL[nivel] || ''}`}>
      <Icono size={12} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <CeldaEditable {...props} />
      </div>
    </div>
  );
}

// ─── Celda de estado: SelectorEstado (motivo de bloqueo, cascada,
// auditoría) — antes un <select> plano que escribía `estado` directo por
// PATCH /:tipo/:id/campo, sin ninguna de esas garantías (ver
// patchCampoEtapa/Accion/Tarea). `entidadTipo` distingue Subaccion de
// Accion porque cambiarEstadoUtil las trata distinto (cascada a hijos).
function CeldaEstado({ row, table }) {
  const { tipo, estado, _raw } = row.original;
  const entidadTipo = tipo === 'etapa'
    ? 'Etapa'
    : tipo === 'tarea'
      ? 'Tarea'
      : (_raw.id_accion_padre ? 'Subaccion' : 'Accion');

  return (
    <SelectorEstado
      entidadTipo={entidadTipo}
      entidadId={row.original.id}
      estadoActual={estado}
      estadoOverride={!!_raw.estado_override}
      onCambio={() => table.options.meta?.onCambioEstado?.()}
      className="text-xs"
    />
  );
}

// ─── Celda de campo extra: las tareas no tienen columna campos_extra ───
function CeldaExtra(props) {
  if (props.row.original.tipo === 'tarea') {
    return <div className="px-2 py-1 text-xs text-gray-300">—</div>;
  }
  return <CeldaEditable {...props} />;
}

// ─── Componente principal ─────────────────────────────────────
export default function VistaLista({ etapas, proyectoId, onRefresh }) {
  const [arbol, setArbol] = useState([]);
  const [camposExtraKeys, setCamposExtraKeys] = useState([]);
  // "Ubicación" empieza oculta: el vínculo con Territorio todavía no
  // resuelve bien en todos los casos, así que no tiene sentido mostrarla
  // por default — sigue disponible para quien la active desde "Columnas".
  const [columnVisibility, setColumnVisibility] = useState({ ubicacion: false });
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showColSelector, setShowColSelector] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [coberturaMap, setCoberturaMap] = useState({});
  const [filaAvance, setFilaAvance] = useState(null); // fila (row.original) con el modal abierto, o null

  // Árbol completo del proyecto (etapas → acciones → subacciones/tareas →
  // tareas de la subacción) en una sola llamada — el mismo endpoint que ya
  // usa Detalle, con avance/semáforo efectivos resueltos por el backend.
  // Antes esta vista pedía SOLO las acciones de cada etapa (una llamada por
  // etapa) y se quedaba ahí: ni subacciones ni tareas llegaban a mostrarse.
  const cargarArbol = useCallback(() => {
    if (!proyectoId) { setCargando(false); return; }
    setCargando(true);
    etapasApi.obtenerArbol(proyectoId)
      .then(res => setArbol(res.datos || []))
      .catch(() => setArbol([]))
      .finally(() => setCargando(false));
  }, [proyectoId]);

  useEffect(() => { cargarArbol(); }, [cargarArbol, etapas]);

  // Cargar schema de campos extra + cobertura geográfica
  useEffect(() => {
    if (!proyectoId) return;
    client.get(`/proyectos/${proyectoId}/campos-extra-schema`)
      .then(({ data }) => setCamposExtraKeys(data.datos || []))
      .catch(() => {});
    client.get(`/proyectos/${proyectoId}/cobertura-detallada`)
      .then(({ data }) => {
        const map = {};
        for (const row of (data.datos || [])) {
          const key = row.id_entidad;
          if (!map[key]) map[key] = [];
          const label = row.municipio_nombre
            ? `${row.municipio_nombre}, ${row.estado_nombre}`
            : row.estado_nombre;
          if (label && !map[key].includes(label)) map[key].push(label);
        }
        setCoberturaMap(map);
      })
      .catch(() => {});
  }, [proyectoId]);

  // Transformar el árbol en filas planas para la tabla, con nivel para la
  // indentación y esContenedor para decidir si "Registrar avance" captura
  // directo o solo informa que se calcula desde sus partes.
  const data = useMemo(() => {
    const filas = [];

    function fila(nodo, tipo, nivel, esContenedor) {
      const esTarea = tipo === 'tarea';
      return {
        id: nodo.id,
        tipo,
        nivel,
        esContenedor,
        nombre: nodo.nombre,
        estado: nodo.estado,
        semaforo: nodo.semaforo_efectivo,
        fecha_inicio: nodo.fecha_inicio_efectiva ?? nodo.fecha_inicio,
        // Tareas guardan "hasta cuándo" en fecha_limite, no fecha_fin — se
        // normaliza aquí para que el resto de la vista (columna, orden,
        // edición) trate a los cuatro niveles por igual.
        fecha_fin: esTarea ? nodo.fecha_limite : (nodo.fecha_fin_efectiva ?? nodo.fecha_fin),
        porcentaje_avance: nodo.avance_efectivo ?? nodo.porcentaje_avance,
        campos_extra: esTarea ? {} : (nodo.campos_extra || {}),
        ubicacion: coberturaMap[nodo.id] || [],
        _raw: nodo,
      };
    }

    for (const etapa of arbol) {
      filas.push(fila(etapa, 'etapa', 0, (etapa.acciones || []).length > 0));
      for (const accion of (etapa.acciones || [])) {
        const tieneHijosAccion = (accion.subacciones || []).length > 0 || (accion.tareas || []).length > 0;
        filas.push(fila(accion, 'accion', 1, tieneHijosAccion));

        // Subacciones (acciones anidadas) y sus propias tareas.
        for (const sub of (accion.subacciones || [])) {
          filas.push(fila(sub, 'accion', 2, (sub.tareas || []).length > 0));
          for (const t of (sub.tareas || [])) {
            filas.push(fila(t, 'tarea', 3, false));
          }
        }
        // Tareas directas de la acción (el caso más común).
        for (const t of (accion.tareas || [])) {
          filas.push(fila(t, 'tarea', 2, false));
        }
      }
    }
    return filas;
  }, [arbol, coberturaMap]);

  // Handler para guardar inline edits
  const actualizarCelda = useCallback(async (row, columnId, value) => {
    const endpoint = row.tipo === 'etapa' ? 'etapas' : row.tipo === 'tarea' ? 'tareas' : 'acciones';
    let campo = columnId;
    let valor = value;

    // Si es campo extra
    if (columnId.startsWith('extra_')) {
      campo = `campos_extra.${columnId.replace('extra_', '')}`;
      valor = value;
    }

    try {
      await client.patch(`/${endpoint}/${row.id}/campo`, { campo, valor });
      // Recarga propia: esta vista ya no depende solo del prop `etapas`
      // (ahora trae su propio árbol con subacciones/tareas), así que un
      // refresco del padre no basta para reflejar el cambio aquí.
      cargarArbol();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error al guardar:', err);
    }
  }, [onRefresh, cargarArbol]);

  // "Estado" ya no pasa por actualizarCelda: SelectorEstado llama a
  // PUT /estado directo (motivo de bloqueo, cascada, auditoría) y solo
  // necesita que la tabla se refresque después.
  const onCambioEstado = useCallback(() => {
    cargarArbol();
    if (onRefresh) onRefresh();
  }, [onRefresh, cargarArbol]);

  // Columnas base
  const columns = useMemo(() => {
    const cols = [
      {
        id: 'semaforo',
        header: '',
        size: 40,
        accessorFn: row => row.semaforo,
        cell: ({ row }) => <SemaforoDot semaforo={row.original.semaforo} estado={row.original.estado} size={8} />,
        enableSorting: false,
      },
      {
        id: 'nombre',
        header: 'Nombre',
        accessorKey: 'nombre',
        size: 260,
        cell: CeldaNombre,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessorKey: 'estado',
        size: 130,
        cell: CeldaEstado,
      },
      {
        id: 'fecha_inicio',
        header: 'Inicio',
        accessorKey: 'fecha_inicio',
        size: 110,
        cell: (props) => <CeldaEditable {...props} formatoDisplay={formatFechaCorta} />,
      },
      {
        id: 'fecha_fin',
        header: 'Fin',
        accessorKey: 'fecha_fin',
        size: 110,
        cell: (props) => <CeldaEditable {...props} formatoDisplay={formatFechaCorta} />,
      },
      {
        id: 'ubicacion',
        header: 'Ubicación',
        accessorFn: row => (row.ubicacion || []).join(', '),
        size: 160,
        cell: ({ row }) => {
          const locs = row.original.ubicacion || [];
          if (locs.length === 0) return <span className="text-gray-300 text-xs">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {locs.slice(0, 2).map((loc, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-medium">
                  <MapPin size={9} />{loc}
                </span>
              ))}
              {locs.length > 2 && (
                <span className="text-[10px] text-gray-400">+{locs.length - 2}</span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'porcentaje_avance',
        header: '%',
        accessorKey: 'porcentaje_avance',
        size: 60,
        cell: ({ getValue }) => {
          const v = getValue();
          return v != null ? <span className="text-xs font-mono">{v}%</span> : <span className="text-gray-300">—</span>;
        },
      },
      {
        id: 'registrar_avance',
        header: '',
        size: 36,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            onClick={() => setFilaAvance(row.original)}
            className="p-1 text-gray-300 hover:text-guinda-600 rounded hover:bg-guinda-50 transition-colors"
            title="Registrar avance"
          >
            <TrendingUp size={14} />
          </button>
        ),
      },
    ];

    // Columnas dinámicas desde campos_extra (no aplica a tareas)
    for (const key of camposExtraKeys) {
      cols.push({
        id: `extra_${key}`,
        header: key.replace(/_/g, ' '),
        accessorFn: row => row.campos_extra?.[key] ?? '',
        size: 120,
        cell: CeldaExtra,
      });
    }

    return cols;
  }, [camposExtraKeys]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    meta: { actualizarCelda, onCambioEstado },
  });

  if (cargando) {
    return <p className="text-sm text-gray-400 text-center py-8">Cargando vista lista...</p>;
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 justify-between">
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="Filtrar..."
          className="border rounded px-3 py-1.5 text-sm w-56 focus:ring-1 focus:ring-red-500 outline-none"
        />
        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setShowColSelector(!showColSelector)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded hover:bg-gray-50"
            >
              <SlidersHorizontal size={14} /> Columnas
            </button>
            {showColSelector && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg p-3 z-20 min-w-48">
                {table.getAllLeafColumns().map(col => (
                  <label key={col.id} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                      className="rounded"
                    />
                    {col.columnDef.header || col.id}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#7B1C3E' }}>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-white whitespace-nowrap select-none"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-1 ${header.column.getCanSort() ? 'cursor-pointer hover:text-red-300' : ''}`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && <ArrowUpDown size={12} className="opacity-50" />}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className={`hover:bg-red-50/50 transition-colors ${
                    row.original.tipo === 'etapa' ? 'bg-gray-50/50 font-medium' : ''
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-1 py-0.5" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>{data.length} elementos</span>
        <span className="text-gray-400">Click en celda para editar</span>
      </div>

      {filaAvance && (
        <ModalRegistrarAvance
          tipo={filaAvance.tipo}
          nodo={filaAvance._raw}
          esContenedor={filaAvance.esContenedor}
          onGuardado={async () => { setFilaAvance(null); cargarArbol(); onRefresh?.(); }}
          onCerrar={() => setFilaAvance(null)}
        />
      )}
    </div>
  );
}
