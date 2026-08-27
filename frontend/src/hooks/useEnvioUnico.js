/**
 * ARCHIVO: useEnvioUnico.js
 * PROPÓSITO: Candado de doble-submit — sincrónico, a diferencia de un
 *            guard basado solo en useState.
 *
 * MINI-CLASE: por qué un guard de useState no basta
 * ─────────────────────────────────────────────────────────────────
 * El patrón `if (guardando) return; ... setGuardando(true)` es
 * vulnerable a una carrera: React actualiza el estado de forma
 * asíncrona, así que dos disparos casi simultáneos (doble clic, Enter +
 * clic, autorepeat de Enter) pueden leer el mismo valor `false` antes de
 * que el primero alcance a marcarlo `true`, y ambos ejecutan el cuerpo
 * completo. Ya pasó en ModalRegistrarAvance.jsx (duplicaba el registro
 * de avance completo). El candado de abajo usa un useRef —de lectura y
 * escritura síncronas— además del useState que ya se usa para la UI
 * (spinner/disabled).
 * ─────────────────────────────────────────────────────────────────
 */
import { useCallback, useRef, useState } from 'react';

// Candado compartido para varios handlers de un mismo componente que no
// deben poder correr a la vez (p. ej. "publicar" y "publicar respuesta"
// de un hilo de comentarios, que comparten un solo `enviando`).
export function useCandado() {
  const ocupadoRef = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = useCallback(async (fn) => {
    if (ocupadoRef.current) return undefined;
    ocupadoRef.current = true;
    setOcupado(true);
    try {
      return await fn();
    } finally {
      ocupadoRef.current = false;
      setOcupado(false);
    }
  }, []);
  return [ejecutar, ocupado];
}

// Caso normal: un handler, un candado.
// const [guardar, guardando] = useEnvioUnico(async () => { ...cuerpo... });
//
// Se devuelve como arreglo (no objeto) para que quien migra conserve los
// nombres que ya usa el archivo (guardar/guardando, enviar/enviando...)
// sin tocar el JSX.
//
// Regla de migración obligatoria para <form onSubmit>: e.preventDefault()
// debe quedar FUERA del candado. Si se envuelve el handleSubmit(e)
// completo, un segundo submit bloqueado sale por el early-return sin
// llamar preventDefault, y el navegador hace submit nativo (recarga la
// página). Patrón correcto:
//   const [guardar, guardando] = useEnvioUnico(async () => { ...sin e... });
//   <form onSubmit={e => { e.preventDefault(); guardar(); }}>
export function useEnvioUnico(fn) {
  const [ejecutar, ocupado] = useCandado();
  const envolver = (...args) => ejecutar(() => fn(...args));
  return [envolver, ocupado];
}
