/**
 * ARCHIVO: ChipFuncion.jsx
 * PROPÓSITO: Decirle al usuario, en la propia tarjeta o ficha del
 *            proyecto, qué función tiene ahí y qué puede hacer.
 *
 * MINI-CLASE: no hacer que el usuario deduzca sus permisos
 * ─────────────────────────────────────────────────────────────────
 * Todos ven todos los proyectos, que es lo que se busca. El problema
 * era que nada distinguía "este lo puedo editar" de "este solo lo
 * consulto": el usuario tenía que abrir el proyecto y ver si aparecía
 * el botón de editar. Este chip responde la pregunta antes de entrar,
 * y el `title` explica en una línea qué implica.
 *
 * Cuando quien lo pinta tiene a mano los permisos del servidor, se los
 * pasa: es la única forma de distinguir a quien fue invitado solo a una
 * etapa (captura ahí) de un lector (no captura en ningún lado).
 * ─────────────────────────────────────────────────────────────────
 */
import { useAuth } from '../../context/AuthContext';
import {
  calcularFuncion, funcionRelevanteEnListado,
  ETIQUETA_FUNCION, DESCRIPCION_FUNCION, COLOR_FUNCION,
} from '../../utils/funcionProyecto';

export default function ChipFuncion({ proyecto, permisos, className = '', ocultarLector = false }) {
  const { usuario } = useAuth();
  const funcion = calcularFuncion(proyecto, usuario, permisos);

  // En listados largos, marcar cada tarjeta ajena con "Solo lectura" es
  // ruido: lo útil es que resalte dónde sí puedes hacer algo.
  if (ocultarLector && !funcionRelevanteEnListado(funcion)) return null;

  return (
    <span
      title={DESCRIPCION_FUNCION[funcion]}
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${COLOR_FUNCION[funcion]} ${className}`}
    >
      {ETIQUETA_FUNCION[funcion]}
    </span>
  );
}
