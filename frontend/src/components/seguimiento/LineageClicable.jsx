/**
 * ARCHIVO: LineageClicable.jsx
 * PROPÓSITO: Ruta de instancia (Proyecto › nombre etapa › nombre acción...)
 *            con los ancestros clicables para subir de nivel — responde
 *            "¿cuál es mi parentela concreta?", complemento de
 *            StepperNivel ("¿qué tan profundo estoy?").
 */
export default function LineageClicable({ ruta, onNavegar, className = '' }) {
  if (!ruta || ruta.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 flex-wrap text-[10px] text-gray-400 font-medium ${className}`}>
      <span>Proyecto</span>
      {ruta.map((paso, i) => {
        const esUltimo = i === ruta.length - 1;
        return (
          <span key={paso.id} className="flex items-center gap-1 min-w-0">
            <span aria-hidden="true">›</span>
            {esUltimo ? (
              <span className="text-gray-500 truncate max-w-[220px]" title={paso.nombre}>{paso.nombre}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavegar(paso.tipo, paso.id)}
                className="truncate max-w-[160px] hover:text-guinda-600 hover:underline underline-offset-2"
                title={`Ir a ${paso.nombre}`}
              >
                {paso.nombre}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
