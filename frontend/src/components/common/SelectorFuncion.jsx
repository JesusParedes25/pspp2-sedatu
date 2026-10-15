/**
 * ARCHIVO: SelectorFuncion.jsx
 * PROPÓSITO: Desplegable de función (colaborador/responsable/invitado)
 *            al invitar o reasignar a alguien en un proyecto o en un
 *            nodo. Fase 4, parte A del modelo de permisos
 *            (docs/modelo-permisos.md): cada opción lleva su nombre y
 *            una línea de qué hace, visible de entrada — nunca detrás
 *            de un hover. Un `<option>` nativo no admite más que texto
 *            plano de una sola línea, así que esto es un listbox propio:
 *            un botón que abre un panel con una tarjeta por opción.
 *
 * El texto de cada opción sale literal de la matriz de capacidades
 * (docs/modelo-permisos.md, Fase 4/parte A) — Colaborador (peldaño
 * `captura`) trabaja DENTRO de la estructura (avance, documentos,
 * comentarios, riesgos, indicadores); Responsable (peldaño
 * `responsable`) DEFINE la estructura (crea hijos, edita ficha, invita/
 * retira/reasigna personas) — esa es la línea real entre las dos, no
 * una lista de sinónimos.
 *
 * "Invitado" (peldaño `lectura`) solo se ofrece cuando el padre pasa
 * `mostrarLectura = true` — la decisión de CUÁNDO mostrarlo mira el
 * PERFIL (usuarios.rol) de la persona seleccionada, nunca este
 * componente: aquí no se sabe ni se debe saber si alguien es externo.
 * El servidor aplica el mismo criterio de forma independiente
 * (`rechazoLecturaParaInterno`, backend/src/utils/validar-funcion-lectura.js)
 * — este componente solo evita ofrecer una opción que el servidor
 * rechazaría, nunca es la única barrera.
 *
 * `administracion_proyecto` nunca vive aquí — no se asigna desde este
 * desplegable, se transfiere (Fase 4, parte B, pendiente).
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// El sustantivo que completa cada descripción ("... en esta etapa", "...
// en todo el proyecto") — una sola función para que los dos lugares que
// usan este selector (equipo del proyecto, miembros de nodo) lo
// resuelvan igual.
export function sustantivoAsignacion(tipo) {
  if (!tipo || tipo === 'proyecto') return 'todo el proyecto';
  const etiquetas = { etapa: 'esta etapa', accion: 'esta acción', tarea: 'esta tarea' };
  return etiquetas[tipo] || 'esta parte del proyecto';
}

const NOMBRE = { captura: 'Colaborador', responsable: 'Responsable', lectura: 'Invitado' };

const DESCRIPCION = {
  captura: sust => `Registra avances, sube documentos, comenta y da seguimiento a riesgos e indicadores en ${sust}.`,
  responsable: sust => `Todo lo de Colaborador, y además crea acciones y tareas, cambia nombres y fechas límite, e invita, retira o cambia la función de otras personas en ${sust}.`,
  lectura: sust => `Puede ver ${sust} sin capturar nada. Es la única forma de que una persona externa tenga acceso.`,
};

const COLOR = {
  captura:     { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  responsable: { bg: 'bg-guinda-100', text: 'text-guinda-700', border: 'border-guinda-200' },
  lectura:     { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
};

/**
 * @param {string} value - 'captura' | 'responsable' | 'lectura'
 * @param {(v: string) => void} onChange
 * @param {string} sustantivo - ver sustantivoAsignacion()
 * @param {boolean} mostrarLectura - true solo si la persona es externa
 */
export default function SelectorFuncion({ value, onChange, sustantivo, mostrarLectura = false, className = '', disabled = false }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    function alHacerClicFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    function alPresionarTecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alHacerClicFuera);
    document.addEventListener('keydown', alPresionarTecla);
    return () => {
      document.removeEventListener('mousedown', alHacerClicFuera);
      document.removeEventListener('keydown', alPresionarTecla);
    };
  }, [abierto]);

  const opciones = ['captura', 'responsable', ...(mostrarLectura ? ['lectura'] : [])];
  const cfg = COLOR[value] || COLOR.captura;

  function elegir(op) {
    if (op !== value) onChange(op);
    setAbierto(false);
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={e => { e.stopPropagation(); if (!disabled) setAbierto(a => !a); }}
        className={`flex items-center gap-0.5 text-[10px] font-medium pl-2 pr-1 py-0.5 rounded-full border outline-none whitespace-nowrap ${
          disabled ? 'cursor-default opacity-80' : 'cursor-pointer'
        } ${cfg.bg} ${cfg.text} ${cfg.border}`}
      >
        {NOMBRE[value] || value}
        {!disabled && <ChevronDown size={11} />}
      </button>

      {abierto && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          onClick={e => e.stopPropagation()}
        >
          {opciones.map(op => (
            <button
              key={op}
              type="button"
              role="option"
              aria-selected={op === value}
              onClick={() => elegir(op)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${op === value ? 'bg-guinda-50/60' : ''}`}
            >
              <Check size={13} className={`mt-0.5 flex-shrink-0 ${op === value ? 'text-guinda-600' : 'text-transparent'}`} />
              <span className="min-w-0">
                <span className={`block text-xs font-semibold ${COLOR[op].text}`}>{NOMBRE[op]}</span>
                <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{DESCRIPCION[op](sustantivo)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
