/**
 * ARCHIVO: AvatarGroup.jsx
 * PROPÓSITO: Grupo de avatares apilados para mostrar equipos de DGs.
 *
 * MINI-CLASE: Avatares con iniciales
 * ─────────────────────────────────────────────────────────────────
 * En lugar de fotos de perfil (que requerirían gestión de imágenes),
 * usamos avatares con las iniciales de la DG o del usuario. Los
 * avatares se apilan con margin negativo (-ml-2) para crear el
 * efecto visual de grupo. Se muestran máximo 4 y un "+N" si hay más.
 * ─────────────────────────────────────────────────────────────────
 */

const colores = [
  'bg-guinda-500', 'bg-verde-500', 'bg-blue-500', 'bg-orange-500',
  'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500'
];

function obtenerIniciales(nombre) {
  return nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function AvatarGroup({ items = [], max = 4 }) {
  const visibles = items.slice(0, max);
  const restantes = items.length - max;

  return (
    <div className="flex items-center -space-x-2">
      {visibles.map((item, indice) => (
        <div
          key={item.id || indice}
          title={item.nombre || item.siglas}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ring-2 ring-white ${colores[indice % colores.length]}`}
        >
          {obtenerIniciales(item.siglas || item.nombre || '?')}
        </div>
      ))}
      {restantes > 0 && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-300 text-gray-600 text-xs font-medium ring-2 ring-white">
          +{restantes}
        </div>
      )}
    </div>
  );
}
