/**
 * ARCHIVO: Toast.jsx
 * PROPÓSITO: Notificación temporal flotante (éxito, error, info).
 *
 * MINI-CLASE: Toasts como feedback efímero
 * ─────────────────────────────────────────────────────────────────
 * Un toast es un mensaje breve que aparece y desaparece sin
 * intervención del usuario. Se usa para confirmar acciones
 * ("Proyecto guardado") o reportar errores ("Error de conexión").
 * Aparece en la esquina inferior derecha y se auto-destruye
 * después de 4 segundos (controlado por UIContext).
 * ─────────────────────────────────────────────────────────────────
 */
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const estilosPorTipo = {
  exito:  { bg: 'bg-green-50 border-green-200', texto: 'text-green-800', icono: CheckCircle, iconColor: 'text-green-500' },
  error:  { bg: 'bg-red-50 border-red-200', texto: 'text-red-800', icono: AlertCircle, iconColor: 'text-red-500' },
  info:   { bg: 'bg-blue-50 border-blue-200', texto: 'text-blue-800', icono: Info, iconColor: 'text-blue-500' },
};

export default function Toast({ mensaje, tipo = 'info' }) {
  const estilo = estilosPorTipo[tipo] || estilosPorTipo.info;
  const Icono = estilo.icono;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center p-4 rounded-lg border shadow-lg ${estilo.bg} animate-slide-up max-w-sm`}>
      <Icono size={20} className={`flex-shrink-0 ${estilo.iconColor}`} />
      <p className={`ml-3 text-sm font-medium ${estilo.texto}`}>{mensaje}</p>
    </div>
  );
}
