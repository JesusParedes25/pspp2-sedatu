/**
 * ARCHIVO: TextoVisibilidadAcceso.jsx
 * PROPÓSITO: El texto de "Visibilidad y acceso" (Configuración de
 *            proyecto), extraído tal cual para que la Guía de uso (Parte
 *            2, bloque 5.2 de "PSPP v2.0 · Inicio, color y la guía de
 *            uso") lo reuse en vez de redactar una copia nueva que
 *            pueda, con el tiempo, decir algo distinto sobre el mismo
 *            permiso — ya se verificó una vez contra el código
 *            (backend/src/utils/autorizacion.js, ver esa ronda) y no hay
 *            que repetir esa verificación por tener dos copias.
 */
export default function TextoVisibilidadAcceso() {
  return (
    <ul className="space-y-4 text-sm text-gray-700">
      <li>
        <span className="font-medium">Quién ve este proyecto:</span>{' '}
        cualquier persona con cuenta dentro de la Secretaría puede verlo, participe en él o no. La única
        excepción es una persona externa a la Secretaría: esa solo ve los proyectos a los que fue invitada.
      </li>
      <li>
        <span className="font-medium">Qué puede hacer cada quien</span> depende de su permiso en cada parte del proyecto:
        <ul className="mt-1.5 space-y-1 list-disc pl-5 text-gray-600">
          <li><span className="font-medium text-gray-700">Solo lectura:</span> consulta, sin cambiar nada.</li>
          <li><span className="font-medium text-gray-700">Colaborador:</span> además registra avance, sube documentos, comenta y da seguimiento a riesgos e indicadores.</li>
          <li><span className="font-medium text-gray-700">Responsable:</span> además edita la ficha, crea y elimina etapas, acciones y tareas, e invita, retira o cambia la función de otras personas.</li>
          <li><span className="font-medium text-gray-700">Administrador:</span> tiene Responsable sobre todo el proyecto, y además edita su ficha general y puede eliminarlo. Solo existe a nivel de todo el proyecto, nunca sobre una sola etapa o acción.</li>
        </ul>
        Cada permiso incluye lo que puede hacer el anterior.
      </li>
      <li>
        <span className="font-medium">El permiso se hereda hacia abajo, nunca hacia arriba:</span>{' '}
        si te invitaron como Responsable de una etapa, lo eres también en sus acciones y tareas. Lo contrario
        no pasa: ser Colaborador de una tarea no te da ningún permiso sobre su acción, su etapa o el proyecto.
      </li>
      <li>
        <span className="font-medium">Lo que no puedes editar, igual lo puedes leer:</span>{' '}
        una parte del proyecto donde no tienes permiso de captura se ve atenuada, con un candado, nunca
        oculta. Su contenido se puede leer completo; solo no se puede cambiar.
      </li>
      <li>
        <span className="font-medium">Importar y exportar:</span>{' '}
        exportar la estructura del proyecto solo exige poder verlo, igual que abrirlo. Importar sí exige ser,
        al menos, Colaborador.
      </li>
      <li>
        Si tu perfil es de Dirección, tus listados personalizados (Tablero, mapas, indicadores) también
        incluyen los proyectos que lidera tu Dirección General, aunque no participes en ellos; eso no
        cambia nada sobre este proyecto en particular: ya lo puedes ver, por la primera regla de arriba.
      </li>
    </ul>
  );
}
