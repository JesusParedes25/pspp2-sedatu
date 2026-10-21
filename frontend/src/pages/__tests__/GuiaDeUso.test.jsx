// @vitest-environment jsdom
/**
 * ARCHIVO: GuiaDeUso.test.jsx
 * PROPÓSITO: "PSPP v2.0 · Inicio, color y la guía de uso", bloque 3/5 —
 *            la página /guia-de-uso, sus tres partes en orden, y que
 *            cada parte reuse el componente/texto real (no una copia):
 *            LeyendaSemaforo, TextoVisibilidadAcceso, los dos diagramas,
 *            y la tabla de permisos verificada (bloque 5.3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import GuiaDeUso from '../GuiaDeUso';

function renderGuia() {
  return render(<GuiaDeUso />);
}

afterEach(cleanup);

describe('GuiaDeUso — estructura de las 3 partes, en orden', () => {
  it('muestra las 3 partes en el orden pedido', () => {
    renderGuia();
    const titulos = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(titulos).toEqual([
      'Cómo se organiza el trabajo',
      'Quién puede hacer qué',
      'Qué puedes hacer en cada actividad',
    ]);
  });
});

describe('GuiaDeUso — Parte 1 (bloque 5.1: texto exacto + diagrama + leyenda real)', () => {
  it('reusa los 6 puntos exactos del encargo, sin parafrasear', () => {
    renderGuia();
    const textos = [
      'Cada proyecto se divide en etapas, cada etapa en acciones, y cada acción en tareas.',
      'Registras el avance en lo más pequeño que tengas asignado. El avance sube solo hasta el proyecto: no hay que actualizarlo en cada nivel.',
      'Cada actividad tiene un estado que tú declaras: sin iniciar, en proceso, bloqueada, completada o cancelada.',
      'Y un semáforo que la plataforma calcula sola a partir de la fecha límite: en tiempo, por vencer, vencida, o sin urgencia cuando falta capturar la fecha.',
      'En Mis actividades ves únicamente lo que te toca a ti. En Seguimiento de proyectos ves todo lo de la Secretaría, aunque solo puedas editar aquello en lo que participas.',
      'Puedes delegar una etapa, una acción o una tarea en otra persona. Lo que delegues aparece en las actividades de quien lo recibe.',
    ];
    for (const texto of textos) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it('incluye el diagrama de jerarquía (árbol real, con el ejemplo PTO de Manzanillo)', () => {
    renderGuia();
    // El mismo árbol de ejemplo aparece en los dos diagramas (4.1 y 4.2),
    // así que las aserciones de texto se acotan al diagrama 4.1 por su
    // propio aria-label, en vez de buscar en toda la página.
    const diagramaJerarquia = within(screen.getByRole('img', { name: /el avance sube solo/i }));
    expect(diagramaJerarquia.getByText('PTO de Manzanillo')).toBeInTheDocument();
    expect(diagramaJerarquia.getByText('Diagnóstico territorial')).toBeInTheDocument();
    expect(diagramaJerarquia.getByText('Integrar información base')).toBeInTheDocument();
    expect(diagramaJerarquia.getByText('Solicitar cartografía')).toBeInTheDocument();
  });

  it('incluye la leyenda real del semáforo (LeyendaSemaforo), no una copia de su texto', () => {
    renderGuia();
    expect(screen.getByText('Urgencia:')).toBeInTheDocument();
  });
});

describe('GuiaDeUso — Parte 2 (bloque 5.2: texto de Visibilidad y acceso + diagrama de herencia)', () => {
  it('reusa TextoVisibilidadAcceso (los 4 permisos, tal cual Configuración > Visibilidad y acceso)', () => {
    renderGuia();
    expect(screen.getByText('Solo lectura:')).toBeInTheDocument();
    expect(screen.getByText('Colaborador:')).toBeInTheDocument();
    expect(screen.getByText('Responsable:')).toBeInTheDocument();
    expect(screen.getByText('Administrador:')).toBeInTheDocument();
    expect(screen.getByText(/El permiso se hereda hacia abajo, nunca hacia arriba:/)).toBeInTheDocument();
  });

  it('incluye el diagrama de herencia de permisos, con las dos flechas rotuladas', () => {
    renderGuia();
    const diagramaHerencia = within(screen.getByRole('img', { name: /El permiso se hereda hacia abajo, nunca hacia arriba/i }));
    expect(diagramaHerencia.getByText('Responsable', { selector: 'text' })).toBeInTheDocument();
  });
});

describe('GuiaDeUso — Parte 3 (bloque 5.3: tabla de permisos verificada contra el código)', () => {
  it('muestra las 4 columnas de permiso y al menos un renglón por tipo de capacidad', () => {
    renderGuia();
    expect(screen.getByText('Solo lectura', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getByText('Colaborador', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getByText('Responsable', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getByText('Administrador', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getByText('Consultar la actividad y sus documentos')).toBeInTheDocument();
    expect(screen.getByText('Registrar avance')).toBeInTheDocument();
    expect(screen.getByText('Crear etapas, acciones o tareas')).toBeInTheDocument();
    expect(screen.getByText('Invitar o retirar personas')).toBeInTheDocument();
  });

  it('NO incluye "ceder la administración" como renglón (ninguno de los 4 permisos la tiene hoy) — en vez de eso, una nota al pie', () => {
    renderGuia();
    expect(screen.queryByText(/[Cc]eder la administración/)).not.toBeInTheDocument();
    expect(screen.getByText(/solicítalo al administrador del sistema/)).toBeInTheDocument();
  });

  it('"Solo lectura" solo tiene palomita en "Consultar la actividad", nunca en las filas de captura/gestión', () => {
    renderGuia();
    const filaConsultar = screen.getByText('Consultar la actividad y sus documentos').closest('tr');
    const filaAvance = screen.getByText('Registrar avance').closest('tr');
    const filaCrear = screen.getByText('Crear etapas, acciones o tareas').closest('tr');
    // Primera columna de datos = "Solo lectura".
    expect(filaConsultar.querySelectorAll('td')[1].textContent).toBe('✓');
    expect(filaAvance.querySelectorAll('td')[1].textContent).toBe('—');
    expect(filaCrear.querySelectorAll('td')[1].textContent).toBe('—');
  });
});
