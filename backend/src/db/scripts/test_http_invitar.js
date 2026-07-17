const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    r.on('error', reject);
    if (b) r.write(b);
    r.end();
  });
}

async function main() {
  const proyectoId = '9bfb7864-0c35-427e-b6e1-64e732e84b8a';

  // 1. Login
  const login = await req('POST', '/api/v1/auth/login', { correo: 'jesus.paredes@sedatu.gob.mx', password: 'demo2026' });
  const token = login.body.datos?.token;
  console.log('1. Login:', login.status === 200 ? 'OK' : 'FAIL', '| rol:', login.body.datos?.usuario?.rol);

  // 2. Get user not in project
  const usuarios = await req('GET', `/api/v1/catalogos/usuarios?excluir_proyecto=${proyectoId}`, null, token);
  const user = usuarios.body.datos?.[0];
  console.log('2. Usuarios disponibles:', usuarios.body.datos?.length, '| primer usuario:', user?.nombre_completo);

  if (!user) { console.log('No hay usuarios fuera del proyecto'); return; }

  // 3. Invite user
  const inv = await req('POST', `/api/v1/proyectos/${proyectoId}/invitaciones`, { id_usuario: user.id, rol: 'colaborador' }, token);
  console.log('3. POST /invitaciones:', inv.status, '|', inv.body.mensaje || inv.body.error);

  if (inv.status !== 201) {
    console.log('   ERROR detalle:', JSON.stringify(inv.body).slice(0, 300));
    return;
  }

  // 4. Verify in members list
  const miembros = await req('GET', `/api/v1/proyectos/${proyectoId}/miembros`, null, token);
  const encontrado = miembros.body.datos?.find(m => m.id_usuario === user.id);
  console.log('4. Aparece en Participantes:', encontrado
    ? `SI — ${encontrado.nombre_completo} | rol=${encontrado.rol}`
    : 'NO');

  // 5. Test duplicate protection
  const dup = await req('POST', `/api/v1/proyectos/${proyectoId}/invitaciones`, { id_usuario: user.id, rol: 'responsable' }, token);
  console.log('5. Duplicado (espera 409):', dup.status, '|', dup.body.mensaje);
}

main().then(() => process.exit(0)).catch(e => { console.error('ERROR:', e); process.exit(1); });
