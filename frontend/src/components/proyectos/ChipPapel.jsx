/**
 * ARCHIVO: ChipPapel.jsx
 * PROPÓSITO: Decirle al usuario, en la propia tarjeta o ficha del
 *            proyecto, qué es él ahí y qué puede hacer.
 *
 * MINI-CLASE: no hacer que el usuario deduzca sus permisos
 * ─────────────────────────────────────────────────────────────────
 * Todos ven todos los proyectos, que es lo que se busca. El problema
 * era que nada distinguía "este lo puedo editar" de "este solo lo
 * consulto": el usuario tenía que abrir el proyecto y ver si aparecía
 * el botón de editar. Este chip responde la pregunta antes de entrar,
 * y el `title` explica en una línea qué implica.
 * ─────────────────────────────────────────────────────────────────
 */
import { useAuth } from '../../context/AuthContext';
import {
  calcularPapel, papelRelevanteEnListado,
  ETIQUETA_PAPEL, DESCRIPCION_PAPEL, COLOR_PAPEL,
} from '../../utils/papelProyecto';

export default function ChipPapel({ proyecto, className = '', ocultarLector = false }) {
  const { usuario } = useAuth();
  const papel = calcularPapel(proyecto, usuario);

  // En listados largos, marcar cada tarjeta ajena con "Consulta" es
  // ruido: lo útil es que resalte dónde sí hay una atribución propia.
  if (ocultarLector && !papelRelevanteEnListado(papel)) return null;

  return (
    <span
      title={DESCRIPCION_PAPEL[papel]}
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${COLOR_PAPEL[papel]} ${className}`}
    >
      {ETIQUETA_PAPEL[papel]}
    </span>
  );
}
