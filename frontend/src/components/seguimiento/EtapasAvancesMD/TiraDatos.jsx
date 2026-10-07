/**
 * ARCHIVO: TiraDatos.jsx
 * PROPÓSITO: Franja horizontal compacta de datos de la ficha (Fase 2 del
 *            rediseño de Detalle) — Responsable, Fecha inicio, Fecha
 *            límite, Captura del avance, Instrumento principal, Escala
 *            territorial — con un botón "Editar ficha" que abre el modal
 *            con todos los campos (ver ModalEditarFicha.jsx).
 *
 * Solo lectura aquí a propósito: todo lo que se ve se edita desde el
 * modal, no campo por campo en la franja — evita el patrón anterior de
 * varios mini-editores inline sueltos, cada uno con su propio candado de
 * guardado.
 */
import { Pencil } from 'lucide-react';
import { formatFecha } from '../../../utils/fecha';

function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-[110px]">
      <dt className="text-[10px] text-gray-400 uppercase tracking-wide">{etiqueta}</dt>
      <dd className="text-xs text-gray-700 mt-0.5">{valor || <span className="text-gray-300">Sin definir</span>}</dd>
    </div>
  );
}

export default function TiraDatos({ nodo, permisos, onEditar }) {
  const { tipo, data } = nodo;
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap bg-gray-50/70 border border-gray-100 rounded-lg px-4 py-3 mb-4">
      <dl className="flex flex-wrap gap-x-6 gap-y-2.5">
        <Dato etiqueta="Responsable" valor={data.responsable_nombre} />
        {!esContenedor && <Dato etiqueta="Fecha inicio" valor={formatFecha(data.fecha_inicio)} />}
        <Dato etiqueta="Fecha límite" valor={formatFecha(data.fecha_limite)} />
        <Dato etiqueta="Captura del avance" valor={esContenedor ? 'Automático' : 'Manual'} />
        {tipo !== 'tarea' && <Dato etiqueta="Instrumento principal" valor={data.instrumento} />}
        {tipo !== 'tarea' && <Dato etiqueta="Escala territorial" valor={data.escala_territorial} />}
      </dl>
      {!permisos.esSoloLectura && (
        <button
          onClick={onEditar}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-guinda-700 hover:text-guinda-800 border border-guinda-200 hover:bg-guinda-50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Pencil size={12} /> Editar ficha
        </button>
      )}
    </div>
  );
}
