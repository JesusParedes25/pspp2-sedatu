/**
 * ARCHIVO: rateLimit.middleware.test.js
 * PROPÓSITO: Límite de peticiones (paso 9 DGTIC, NOF-7) — con servidores
 *            Express reales y `fetch` (mismo patrón que
 *            subida-limite-413.test.js), nunca con mocks del propio
 *            express-rate-limit:
 *            1. `trust proxy` resuelve req.ip correctamente con 1 y con
 *               2 saltos de proxy — la base de la que depende todo lo
 *               demás (sin esto, un valor insuficiente deja colarse la
 *               IP del proxy; uno de más confía en un X-Forwarded-For
 *               que cualquiera puede mandar).
 *            2. El límite de login se agota por separado por IP y por
 *               correo, y la respuesta 429 trae codigo/mensaje/segundos.
 *            3. El límite general de la API deja pasar sin contar la
 *               ruta de notificaciones en tiempo real (SSE).
 *
 * Cada test que necesita un `max`/`windowMs` propio fija las variables
 * de entorno y vuelve a requerir el middleware con jest.isolateModules
 * — el módulo las lee una sola vez, al construir cada limitador.
 *
 * Ejecutar: npm test
 */
const express = require('express');

function levantar(app) {
  return new Promise((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => resolve({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
  });
}
function apagar(servidor) {
  return new Promise((resolve) => servidor.close(resolve));
}

// Cada proxy real APPENDS (nunca reemplaza) la IP de quien se conectó a
// ÉL — no la suya propia — al final de X-Forwarded-For
// ($proxy_add_x_forwarded_for en nginx). Por eso, vista desde Express, la
// entrada MÁS A LA IZQUIERDA es la más vieja (lo primero que alguien
// afirmó, quien sea que haya sido) y las de la derecha son las que
// agregó cada proxy real, de más lejano a más cercano. `trust proxy = N`
// le dice a Express cuántas de esas entradas de la derecha son de
// proxies en los que SÍ confiamos; la entrada justo a la izquierda de
// esas N es el cliente. Cualquier cosa más a la izquierda de ahí pudo
// haberla escrito el propio navegador (nada impide que alguien mande su
// propio X-Forwarded-For) y Express la ignora a propósito.
describe('trust proxy — req.ip con 1 y 2 saltos', () => {
  let servidor1, base1, servidor2, base2;

  beforeAll(async () => {
    const app1 = express();
    app1.set('trust proxy', 1);
    app1.get('/ip', (req, res) => res.json({ ip: req.ip }));
    ({ servidor: servidor1, base: base1 } = await levantar(app1));

    const app2 = express();
    app2.set('trust proxy', 2);
    app2.get('/ip', (req, res) => res.json({ ip: req.ip }));
    ({ servidor: servidor2, base: base2 } = await levantar(app2));
  });
  afterAll(async () => { await apagar(servidor1); await apagar(servidor2); });

  test('1 salto configurado (nativo: un solo nginx delante) — la entrada que agregó ESE proxy es el cliente, ignora lo que el navegador haya mandado de más', async () => {
    // El navegador le mandó a nginx su propio X-Forwarded-For con un
    // valor inventado ("203.0.113.9"); nginx, el único proxy real y de
    // confianza, agregó la IP de quien de verdad se conectó a él
    // ("198.51.100.5") al final.
    const r = await fetch(`${base1}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9, 198.51.100.5' } });
    const { ip } = await r.json();
    expect(ip).toBe('198.51.100.5');
  });

  test('2 saltos configurados (Nginx Proxy Manager + nginx propio, o F5 + nginx institucional) — llega hasta la IP que el SEGUNDO proxy real agregó, ignorando lo que haya antes', async () => {
    // Cadena real de dos saltos: el navegador (o un atacante) mandó
    // "203.0.113.9" por su cuenta; el primer proxy real agregó la IP de
    // quien se conectó a él ("198.51.100.5", el verdadero origen); el
    // segundo proxy agregó la IP del primero ("10.0.0.2").
    const r = await fetch(`${base2}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9, 198.51.100.5, 10.0.0.2' } });
    const { ip } = await r.json();
    expect(ip).toBe('198.51.100.5');
  });

  test('PELIGRO si el valor es insuficiente: con la cadena real de 2 saltos pero trust proxy=1, Express toma la IP del PRIMER proxy como si fuera la de cada persona', async () => {
    // Sin el segundo salto configurado, Express se detiene un proxy
    // antes de donde debería — exactamente el escenario que describe el
    // comentario de server.js: todo el tráfico real cae en la IP del
    // proxy intermedio ("10.0.0.2" en esta cadena), igual para cualquier
    // persona detrás de él, y la primera ráfaga agotaría la cuota para
    // todo el mundo.
    const r = await fetch(`${base1}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9, 198.51.100.5, 10.0.0.2' } });
    const { ip } = await r.json();
    expect(ip).toBe('10.0.0.2');
  });
});

describe('límite de login — estricto, por IP y por correo', () => {
  let servidor, base;

  beforeAll(async () => {
    process.env.LIMITE_PETICIONES_LOGIN_VENTANA_MIN = '1';
    process.env.LIMITE_PETICIONES_LOGIN_MAX = '2';
    let limiteLoginPorIp, limiteLoginPorCorreo;
    jest.isolateModules(() => {
      ({ limiteLoginPorIp, limiteLoginPorCorreo } = require('../middleware/rateLimit.middleware'));
    });
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/login', limiteLoginPorIp, limiteLoginPorCorreo, (req, res) => res.json({ ok: true }));
    ({ servidor, base } = await levantar(app));
  });
  afterAll(async () => {
    await apagar(servidor);
    delete process.env.LIMITE_PETICIONES_LOGIN_VENTANA_MIN;
    delete process.env.LIMITE_PETICIONES_LOGIN_MAX;
  });

  async function intentar(correo, ip) {
    return fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ correo, password: 'x' }),
    });
  }

  test('la 3ª petición de la misma IP y correo responde 429 con código, mensaje y segundos para reintentar', async () => {
    expect((await intentar('ana@example.org', '203.0.113.1')).status).toBe(200);
    expect((await intentar('ana@example.org', '203.0.113.1')).status).toBe(200);
    const r = await intentar('ana@example.org', '203.0.113.1');
    expect(r.status).toBe(429);
    const cuerpo = await r.json();
    expect(cuerpo.codigo).toBe('DEMASIADAS_PETICIONES');
    expect(cuerpo.mensaje).toMatch(/intentos de inicio de sesión/i);
    expect(cuerpo.reintentar_en_segundos).toBeGreaterThan(0);
  });

  test('un correo distinto desde la MISMA ip ya agotada también cae (comparte el límite por IP)', async () => {
    const r = await intentar('otra-persona@example.org', '203.0.113.1');
    expect(r.status).toBe(429);
  });

  test('el mismo correo desde OTRA ip sigue bloqueado (el límite por correo es independiente del de IP)', async () => {
    const r = await intentar('ana@example.org', '203.0.113.2');
    expect(r.status).toBe(429);
  });

  test('un correo nuevo desde una IP nueva sí pasa', async () => {
    const r = await intentar('persona-nueva@example.org', '203.0.113.50');
    expect(r.status).toBe(200);
  });
});

describe('límite general de la API — deja pasar sin contar la ruta de notificaciones en tiempo real', () => {
  let servidor, base;

  beforeAll(async () => {
    process.env.LIMITE_PETICIONES_API_VENTANA_MIN = '1';
    process.env.LIMITE_PETICIONES_API_MAX = '2';
    let limiteApiGeneral;
    jest.isolateModules(() => {
      ({ limiteApiGeneral } = require('../middleware/rateLimit.middleware'));
    });
    const app = express();
    app.set('trust proxy', 1);
    app.use((req, res, next) => { req.usuario = { id: 'usuario-de-prueba' }; next(); });
    app.use(limiteApiGeneral);
    app.get('/notificaciones/stream', (req, res) => res.json({ ok: true }));
    app.get('/proyectos', (req, res) => res.json({ ok: true }));
    ({ servidor, base } = await levantar(app));
  });
  afterAll(async () => {
    await apagar(servidor);
    delete process.env.LIMITE_PETICIONES_API_VENTANA_MIN;
    delete process.env.LIMITE_PETICIONES_API_MAX;
  });

  test('la ruta SSE nunca cuenta contra la cuota, ni tras muchas peticiones', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${base}/notificaciones/stream`);
      expect(r.status).toBe(200);
    }
  });

  test('el resto de la API sí cuenta, y la 3ª petición en la ventana responde 429', async () => {
    expect((await fetch(`${base}/proyectos`)).status).toBe(200);
    expect((await fetch(`${base}/proyectos`)).status).toBe(200);
    const r = await fetch(`${base}/proyectos`);
    expect(r.status).toBe(429);
    const cuerpo = await r.json();
    expect(cuerpo.codigo).toBe('DEMASIADAS_PETICIONES');
  });
});
