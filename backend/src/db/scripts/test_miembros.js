const pool = require('../pool');
const miembrosQueries = require('../../db/queries/miembros.queries');

async function test() {
  const proyectoId  = '9bfb7864-0c35-427e-b6e1-64e732e84b8a';
  const userId      = 'f199363d-a072-47de-b80b-707ef3ef6cdf';
  const invitadoPor = '019c1c4e-5698-4dcd-a987-3e1018e3e951';

  console.log('1. SELECT 1 check...');
  const { rows } = await pool.query(
    'SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
    [proyectoId, userId]
  );
  console.log('   OK, rows:', rows.length);

  console.log('2. obtenerRolUsuario...');
  const rol = await miembrosQueries.obtenerRolUsuario(proyectoId, invitadoPor);
  console.log('   OK, rol:', rol);

  console.log('3. agregarMiembro...');
  const m = await miembrosQueries.agregarMiembro(proyectoId, userId, 'colaborador', invitadoPor);
  console.log('   OK:', JSON.stringify(m));
}

test().then(() => process.exit(0)).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
