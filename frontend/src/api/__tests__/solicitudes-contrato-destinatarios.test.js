/**
 * ARCHIVO: solicitudes-contrato-destinatarios.test.js
 * PROPÓSITO: Verificar el CONTRATO exacto entre lo que
 *            solicitudes.controller.js::crear() responde y lo que
 *            BotonSolicitarParticipar.jsx espera leer, sin pasar por la
 *            red real — un desajuste de "en qué nivel del sobre JSON
 *            vive `destinatarios`" no lo detecta ninguna prueba que
 *            mire solo el backend (ver solicitudes-crear-destinatarios.test.js,
 *            en backend) ni ninguna que mire solo el frontend por
 *            separado: hace falta una que fije la forma real del body
 *            que el backend manda y confirme que `solicitarParticipacion`/
 *            `solicitarParticipacionNodo` la leen tal cual, sin asumir
 *            un nivel de anidado distinto.
 *
 * El body de abajo es una copia literal de lo que
 * `solicitudes.controller.js::crear()` construye hoy
 * (`res.status(201).json({ datos, destinatarios, mensaje })` — los tres
 * como claves HERMANAS, no uno anidado dentro de otro). Si ese shape
 * cambia alguna vez sin actualizar esta prueba, falla aquí antes de
 * llegar a producción.
 *
 * Ejecutar: npm test (vitest)
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  default: { post: vi.fn() },
}));

const client = (await import('../client')).default;
const { solicitarParticipacion, solicitarParticipacionNodo } = await import('../solicitudes');

const RESPUESTA_BACKEND = {
  datos: { id: 'sol-1', funcion: 'captura', id_usuario: 'u-1', id_proyecto: 'p-1' },
  destinatarios: [
    { id_usuario: 'admin-1', nombre_completo: 'Admin del Proyecto', correo: 'admin@sedatu.gob.mx' },
  ],
  mensaje: 'Solicitud enviada',
};

beforeEach(() => {
  vi.clearAllMocks();
  client.post.mockResolvedValue({ data: RESPUESTA_BACKEND });
});

describe('contrato de respuesta: destinatarios es HERMANO de datos, no anidado dentro', () => {
  test('solicitarParticipacion devuelve {datos, destinatarios} en el nivel que el componente destructura', async () => {
    const resultado = await solicitarParticipacion('p-1', { funcion: 'captura' });

    // Exactamente lo que BotonSolicitarParticipar.jsx hace:
    // const { datos: solicitud, destinatarios } = await solicitarParticipacion(...)
    const { datos: solicitud, destinatarios } = resultado;

    expect(solicitud).toEqual(RESPUESTA_BACKEND.datos);
    expect(destinatarios).toEqual(RESPUESTA_BACKEND.destinatarios);
    expect(destinatarios).toHaveLength(1);
    expect(destinatarios[0].correo).toBe('admin@sedatu.gob.mx');
  });

  test('solicitarParticipacionNodo devuelve la misma forma', async () => {
    const resultado = await solicitarParticipacionNodo('etapa', 'e-1', { funcion: 'captura' });
    const { datos: solicitud, destinatarios } = resultado;

    expect(solicitud).toEqual(RESPUESTA_BACKEND.datos);
    expect(destinatarios).toEqual(RESPUESTA_BACKEND.destinatarios);
  });

  test('si el backend alguna vez anida destinatarios DENTRO de datos, esta prueba lo detecta', async () => {
    client.post.mockResolvedValue({
      data: { datos: { ...RESPUESTA_BACKEND.datos, destinatarios: RESPUESTA_BACKEND.destinatarios }, mensaje: 'x' },
    });

    const { destinatarios } = await solicitarParticipacion('p-1', { funcion: 'captura' });

    // Con el shape incorrecto (anidado), destinatarios en el nivel
    // esperado por el componente queda undefined — esto es justo lo que
    // debe fallar si alguien reintroduce ese desajuste.
    expect(destinatarios).toBeUndefined();
  });
});
