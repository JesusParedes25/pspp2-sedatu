/**
 * ARCHIVO: ProgresoSubida.jsx
 * PROPÓSITO: Barra de avance de una subida de archivo. Una barra que avanza
 *            es la diferencia entre esperar y creer que la aplicación se
 *            trabó, sobre todo con archivos pesados (audio, video, capas
 *            geográficas) en enlaces lentos.
 *
 * fraccion: 0..1 mientras sube; null si el navegador no conoce el total;
 * 1 cuando el archivo ya salió completo y el servidor lo está guardando
 * (ahí no hay avance que medir, solo se avisa).
 */
export default function ProgresoSubida({ nombre, fraccion, className = '' }) {
  const porcentaje = fraccion == null ? null : Math.round(Math.min(1, Math.max(0, fraccion)) * 100);
  const guardando = porcentaje === 100;
  const etiqueta = guardando
    ? 'Guardando en el servidor…'
    : porcentaje == null ? 'Subiendo…' : `Subiendo… ${porcentaje} %`;

  return (
    <div className={`space-y-1 ${className}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-600">
        <span className="truncate min-w-0">{nombre}</span>
        <span className="flex-shrink-0 tabular-nums">{etiqueta}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-label={nombre ? `Subida de ${nombre}` : 'Subida de archivo'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje ?? undefined}
      >
        <div
          className={`h-full rounded-full bg-[#7B1C3E] transition-[width] duration-200 ${porcentaje == null || guardando ? 'animate-pulse' : ''}`}
          style={{ width: `${porcentaje == null ? 100 : porcentaje}%` }}
        />
      </div>
    </div>
  );
}
