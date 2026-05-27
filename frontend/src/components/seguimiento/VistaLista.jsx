/**
 * ARCHIVO: VistaLista.jsx
 * PROPÓSITO: DataGrid editable con TanStack Table para seguimiento en vista lista.
 *
 * - Columnas fijas: semáforo, nombre, estado, fecha_inicio, fecha_fin
 * - Columnas dinámicas: generadas desde campos_extra JSONB del proyecto
 * - Inline editing: click en celda → input/select → PATCH al backend
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
import { ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import client from '../../api/client';
import SemaforoChip from '../common/SemaforoChip';

const ESTADOS_OPCIONES = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];
const SEMAFORO_OPCIONES = ['verde', 'amarillo', 'naranja', 'rojo', 'gris', 'azul', 'negro'];

// ─── Celda editable ───────────────────────────────────────────
function CeldaEditable({ getValue, row, column, table }) {
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
    return (
      <div
        className="px-2 py-1 cursor-pointer hover:bg-red-50 rounded min-h-[28px] text-sm truncate"
        onClick={() => setEditing(true)}
        title={String(value || '')}
      >
        {value || <span className="text-gray-300">—</span>}
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

// ─── Celda select (para estado/semáforo) ──────────────────────
function CeldaSelect({ getValue, row, column, table, opciones }) {
  const value = getValue();

  const onChange = (e) => {
    table.options.meta?.actualizarCelda(row.original, column.id, e.target.value);
  };

  return (
    <select
      value={value || ''}
      onChange={onChange}
      className="w-full px-1 py-1 text-xs border rounded bg-white cursor-pointer hover:bg-red-50"
    >
      <option value="">—</option>
      {opciones.map(op => <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>)}
    </select>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function VistaLista({ etapas, proyectoId, onRefresh }) {
  const [acciones, setAcciones] = useState([]);
  const [camposExtraKeys, setCamposExtraKeys] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showColSelector, setShowColSelector] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Cargar acciones de todas las etapas
  useEffect(() => {
    if (!etapas || etapas.length === 0) { setCargando(false); return; }
    setCargando(true);
    Promise.all(
      etapas.map(e => client.get(`/etapas/${e.id}/acciones`).then(r => r.data.datos || []).catch(() => []))
    ).then(results => {
      setAcciones(results.flat());
      setCargando(false);
    });
  }, [etapas]);

  // Cargar schema de campos extra
  useEffect(() => {
    if (!proyectoId) return;
    client.get(`/proyectos/${proyectoId}/campos-extra-schema`)
      .then(({ data }) => setCamposExtraKeys(data.datos || []))
      .catch(() => {});
  }, [proyectoId]);

  // Transformar etapas + acciones en filas planas para la tabla
  const data = useMemo(() => {
    const filas = [];
    for (const etapa of (etapas || [])) {
      filas.push({
        id: etapa.id,
        tipo: 'etapa',
        nombre: etapa.nombre,
        estado: etapa.estado,
        semaforo: etapa.semaforo,
        fecha_inicio: etapa.fecha_inicio,
        fecha_fin: etapa.fecha_fin,
        porcentaje_avance: etapa.porcentaje_avance,
        campos_extra: etapa.campos_extra || {},
        _raw: etapa,
      });
      for (const accion of (acciones || []).filter(a => a.id_etapa === etapa.id && !a.id_accion_padre)) {
        filas.push({
          id: accion.id,
          tipo: 'accion',
          nombre: `  └ ${accion.nombre}`,
          estado: accion.estado,
          semaforo: accion.semaforo,
          fecha_inicio: accion.fecha_inicio,
          fecha_fin: accion.fecha_fin,
          porcentaje_avance: accion.porcentaje_avance,
          campos_extra: accion.campos_extra || {},
          _raw: accion,
        });
      }
    }
    return filas;
  }, [etapas, acciones]);

  // Handler para guardar inline edits
  const actualizarCelda = useCallback(async (row, columnId, value) => {
    const endpoint = row.tipo === 'etapa' ? 'etapas' : 'acciones';
    let campo = columnId;
    let valor = value;

    // Si es campo extra
    if (columnId.startsWith('extra_')) {
      campo = `campos_extra.${columnId.replace('extra_', '')}`;
      valor = value;
    }

    try {
      await client.patch(`/${endpoint}/${row.id}/campo`, { campo, valor });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error al guardar:', err);
    }
  }, [onRefresh]);

  // Columnas base
  const columns = useMemo(() => {
    const cols = [
      {
        id: 'semaforo',
        header: '',
        size: 40,
        accessorFn: row => row.semaforo,
        cell: ({ row }) => <SemaforoChip valor={row.original.semaforo} size="sm" />,
        enableSorting: false,
      },
      {
        id: 'nombre',
        header: 'Nombre',
        accessorKey: 'nombre',
        size: 250,
        cell: CeldaEditable,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessorKey: 'estado',
        size: 130,
        cell: (props) => <CeldaSelect {...props} opciones={ESTADOS_OPCIONES} />,
      },
      {
        id: 'fecha_inicio',
        header: 'Inicio',
        accessorKey: 'fecha_inicio',
        size: 110,
        cell: CeldaEditable,
      },
      {
        id: 'fecha_fin',
        header: 'Fin',
        accessorKey: 'fecha_fin',
        size: 110,
        cell: CeldaEditable,
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
    ];

    // Columnas dinámicas desde campos_extra
    for (const key of camposExtraKeys) {
      cols.push({
        id: `extra_${key}`,
        header: key.replace(/_/g, ' '),
        accessorFn: row => row.campos_extra?.[key] ?? '',
        size: 120,
        cell: CeldaEditable,
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
    meta: { actualizarCelda },
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
            <thead className="bg-gray-900 text-white sticky top-0 z-10">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap select-none"
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
    </div>
  );
}
