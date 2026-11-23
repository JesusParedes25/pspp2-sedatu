/**
 * ARCHIVO: correo.test.js
 * PROPÓSITO: utils/correo.js — única interfaz de envío de correo del
 *            backend (paso 8 DGTIC, retira EmailJS). Fija el contrato
 *            central: SMTP_HOST es el interruptor (ausente = deshabilitado,
 *            sin tronar), enviarCorreo nunca lanza aunque el transporte
 *            falle, y sin destinatario se omite el intento.
 *
 * nodemailer está mockeado en todo el archivo: ningún correo sale de
 * verdad. jest.resetModules() entre pruebas porque utils/correo.js cachea
 * el transportador en una variable de módulo — sin resetear, la primera
 * prueba que define SMTP_HOST contaminaría las siguientes.
 *
 * Ejecutar: npm test
 */
const ENV_ORIGINAL = { ...process.env };

function limpiarEnvSmtp() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PUERTO;
  delete process.env.SMTP_USUARIO;
  delete process.env.SMTP_CONTRASENA;
  delete process.env.SMTP_SEGURO;
  delete process.env.CORREO_REMITENTE;
  delete process.env.CORREO_REMITENTE_NOMBRE;
}

let sendMailMock;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ENV_ORIGINAL };
  limpiarEnvSmtp();
  sendMailMock = jest.fn().mockResolvedValue({});
  jest.doMock('nodemailer', () => ({
    createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
  }));
});

afterAll(() => { process.env = ENV_ORIGINAL; });

test('sin SMTP_HOST: envío omitido, nunca intenta el transporte', async () => {
  const { enviarCorreo } = require('../utils/correo');
  const resultado = await enviarCorreo({ para: 'alguien@example.org', asunto: 'Asunto', texto: 'Texto' });

  expect(resultado).toEqual({ enviado: false, motivo: 'smtp_no_configurado' });
  expect(sendMailMock).not.toHaveBeenCalled();
});

test('sin destinatario: envío omitido aunque SMTP_HOST esté definida', async () => {
  process.env.SMTP_HOST = 'smtp.example.org';
  const { enviarCorreo } = require('../utils/correo');
  const resultado = await enviarCorreo({ para: null, asunto: 'Asunto', texto: 'Texto' });

  expect(resultado).toEqual({ enviado: false, motivo: 'sin_destinatario' });
  expect(sendMailMock).not.toHaveBeenCalled();
});

test('con SMTP_HOST definida: intenta el envío con los datos correctos', async () => {
  process.env.SMTP_HOST = 'smtp.example.org';
  process.env.SMTP_USUARIO = 'notificaciones@example.org';
  process.env.CORREO_REMITENTE_NOMBRE = 'PSPP Pruebas';
  const nodemailer = require('nodemailer');
  const { enviarCorreo } = require('../utils/correo');

  const resultado = await enviarCorreo({ para: 'destino@example.org', asunto: 'Asunto', texto: 'Cuerpo del correo' });

  expect(resultado).toEqual({ enviado: true });
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.org' }));
  expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
    to: 'destino@example.org',
    subject: 'Asunto',
    text: 'Cuerpo del correo',
    from: expect.stringContaining('PSPP Pruebas'),
  }));
});

test('si el transporte falla, nunca lanza — devuelve {enviado:false, motivo}', async () => {
  process.env.SMTP_HOST = 'smtp.example.org';
  sendMailMock.mockRejectedValue(new Error('Conexión rechazada'));
  const { enviarCorreo } = require('../utils/correo');

  await expect(enviarCorreo({ para: 'destino@example.org', asunto: 'Asunto', texto: 'Texto' }))
    .resolves.toEqual({ enviado: false, motivo: 'error_transporte' });
});

describe('destinoTexto', () => {
  test('sin nodo: "el proyecto «X»"', () => {
    const { destinoTexto } = require('../utils/correo');
    expect(destinoTexto({ nombreProyecto: 'Catastro Nacional' })).toBe('el proyecto «Catastro Nacional»');
  });

  test('con nodo: "la etapa «X» del proyecto «Y»"', () => {
    const { destinoTexto } = require('../utils/correo');
    expect(destinoTexto({ tipoNodo: 'etapa', nombreNodo: 'Diagnóstico', nombreProyecto: 'Catastro Nacional' }))
      .toBe('la etapa «Diagnóstico» del proyecto «Catastro Nacional»');
  });
});
