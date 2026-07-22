/**
 * ARCHIVO: CampoFecha.jsx
 * PROPÓSITO: Input de fecha reutilizable (click-to-edit) usado en el rail
 *            de propiedades de Seguimiento y dentro de la tarjeta expandible
 *            de nodo (NodoCard), para que ambos editen el mismo campo con
 *            la misma UI.
 */
export default function CampoFecha({ label, valor, onChange, soloLectura }) {
  if (soloLectura) {
    return (
      <div>
        {label && <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>}
        <span className="text-xs text-gray-700">{valor ? new Date(valor).toLocaleDateString('es-MX') : '—'}</span>
      </div>
    );
  }
  return (
    <div>
      {label && <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>}
      <input
        type="date"
        value={valor || ''}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full bg-white focus:border-[#7B1C3E] outline-none"
      />
    </div>
  );
}
