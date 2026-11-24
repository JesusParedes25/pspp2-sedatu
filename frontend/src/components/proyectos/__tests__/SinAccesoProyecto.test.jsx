// @vitest-environment jsdom
/**
 * ARCHIVO: SinAccesoProyecto.test.jsx
 * PROPÓSITO: paso 12 DGTIC — la pantalla que reemplaza al contenido de un
 *            proyecto cuando la persona no tiene visibilidad. Fija el
 *            contrato: muestra el nombre y la DG responsable (datos que
 *            SÍ llegan, porque GET /proyectos/:id sigue sin candado de
 *            visibilidad a propósito — ver DetalleProyectoLayout.jsx),
 *            el mensaje de sin acceso, y el botón de solicitar
 *            participación — nunca contenido del proyecto (etapas,
 *            avance, actividad).
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SinAccesoProyecto from '../SinAccesoProyecto';

afterEach(cleanup);

vi.mock('../../../api/solicitudes', () => ({
  misSolicitudes: vi.fn().mockResolvedValue([]),
  solicitarParticipacion: vi.fn(),
  solicitarParticipacionNodo: vi.fn(),
}));

const PROYECTO = {
  id: 'p-1',
  nombre: 'Catastro Nacional',
  dg_lider_siglas: 'DGOTU',
  direccion_area_lider_siglas: 'DAOT',
};

const PERMISOS_SIN_ACCESO = {
  esSoloLectura: true,
  capturaParcial: false,
  puedeInvitar: false,
  puedeEditarNodo: () => false,
};

describe('SinAccesoProyecto', () => {
  test('muestra el nombre del proyecto y la DG responsable', () => {
    render(<SinAccesoProyecto proyecto={PROYECTO} permisos={PERMISOS_SIN_ACCESO} />);

    expect(screen.getByText('Catastro Nacional')).toBeInTheDocument();
    expect(screen.getByText('DGOTU / DAOT')).toBeInTheDocument();
  });

  test('muestra el mensaje de sin acceso', () => {
    render(<SinAccesoProyecto proyecto={PROYECTO} permisos={PERMISOS_SIN_ACCESO} />);

    expect(screen.getByText(/No tienes acceso a este proyecto/)).toBeInTheDocument();
  });

  test('muestra el botón de solicitar participación cuando no se puede capturar', () => {
    render(<SinAccesoProyecto proyecto={PROYECTO} permisos={PERMISOS_SIN_ACCESO} />);

    expect(screen.getByRole('button', { name: /Solicitar participar/i })).toBeInTheDocument();
  });

  test('no muestra nada de contenido del proyecto (ninguna de las etiquetas de las secciones reales)', () => {
    render(<SinAccesoProyecto proyecto={PROYECTO} permisos={PERMISOS_SIN_ACCESO} />);

    for (const etiqueta of ['Seguimiento', 'Indicadores', 'Riesgos', 'Documentos', 'Actividad', 'Configuración']) {
      expect(screen.queryByText(etiqueta)).not.toBeInTheDocument();
    }
  });

  test('sin DG asignada, no revienta y simplemente omite esa línea', () => {
    render(<SinAccesoProyecto proyecto={{ id: 'p-2', nombre: 'Proyecto sin DG' }} permisos={PERMISOS_SIN_ACCESO} />);

    expect(screen.getByText('Proyecto sin DG')).toBeInTheDocument();
  });
});
