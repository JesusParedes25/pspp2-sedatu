/**
 * ARCHIVO: Login.jsx
 * PROPÓSITO: Página de inicio de sesión con formulario de correo y contraseña.
 *
 * MINI-CLASE: Formularios controlados en React
 * ─────────────────────────────────────────────────────────────────
 * Un formulario "controlado" mantiene el valor de cada input en un
 * useState. onChange actualiza el estado y el input refleja el valor
 * del estado. Esto permite validar, transformar o resetear los
 * valores programáticamente. El submit previene el comportamiento
 * por defecto del navegador (recargar la página) y llama a la
 * función login() de AuthContext.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

export default function Login() {
  const { login } = useAuth();
  const { mostrarToast } = useUI();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      await login(correo, password);
      mostrarToast('Bienvenido a PSPP', 'exito');
    } catch (err) {
      const mensaje = err.response?.data?.mensaje || 'Error de conexión con el servidor';
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — branding institucional */}
      <div className="hidden lg:flex lg:w-1/2 bg-guinda-700 text-white flex-col justify-center items-center p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-8">
            <span className="text-guinda-700 font-black text-2xl">PS</span>
          </div>
          <h1 className="text-3xl font-bold mb-4">PSPP v2.0</h1>
          <p className="text-guinda-200 text-lg mb-2">Plataforma de Seguimiento de Proyectos Prioritarios</p>
          <p className="text-guinda-300 text-sm">Secretaría de Desarrollo Agrario, Territorial y Urbano</p>

          <div className="mt-12 border-t border-guinda-600 pt-8">
            <p className="text-guinda-300 text-xs">
              Sistema de uso interno exclusivo de SEDATU.
              Acceso restringido a personal autorizado.
            </p>
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 bg-guinda-700 rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-lg">PS</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">PSPP v2.0</h1>
            <p className="text-sm text-gray-500">SEDATU</p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesión</h2>
          <p className="text-sm text-gray-500 mb-8">Ingresa con tu correo institucional</p>

          <form onSubmit={manejarSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Correo */}
            <div>
              <label htmlFor="correo" className="block text-sm font-medium text-gray-700 mb-1">
                Correo electrónico
              </label>
              <input
                id="correo"
                type="email"
                value={correo}
                onChange={e => setCorreo(e.target.value)}
                placeholder="usuario@sedatu.gob.mx"
                required
                autoFocus
                className="input-base"
              />
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
                className="input-base"
              />
            </div>

            {/* Botón submit */}
            <button
              type="submit"
              disabled={cargando}
              className="btn-primary w-full py-2.5"
            >
              {cargando ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          {/* Selector rápido de usuarios de demostración */}
          <div className="mt-8">
            <p className="text-xs text-gray-400 text-center mb-3">Usuarios de demostración <span className="font-mono text-gray-500">(pass: demo2026)</span></p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { correo: 'jesus.paredes@sedatu.gob.mx', nombre: 'Jesús Paredes', rol: 'Responsable', dg: 'DGOTU / DAOT' },
                { correo: 'pablo.director@sedatu.gob.mx', nombre: 'Pablo (Director)', rol: 'Directivo', dg: 'DGOTU / DAOT' },
                { correo: 'enlace.dgomr@sedatu.gob.mx', nombre: 'Enlace DGOMR', rol: 'Responsable', dg: 'DGOMR' },
                { correo: 'enlace.dgpv@sedatu.gob.mx', nombre: 'Enlace DGPV', rol: 'Responsable', dg: 'DGPV' },
                { correo: 'enlace.ran@sedatu.gob.mx', nombre: 'Enlace RAN', rol: 'Operativo', dg: 'DGOTU' },
                { correo: 'subsecretario@sedatu.gob.mx', nombre: 'Subsecretario SOTUV', rol: 'Ejecutivo', dg: 'DGOTU' },
              ].map(u => (
                <button
                  key={u.correo}
                  type="button"
                  onClick={() => { setCorreo(u.correo); setPassword('demo2026'); }}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    correo === u.correo
                      ? 'border-guinda-300 bg-guinda-50 text-guinda-700'
                      : 'border-gray-200 hover:border-guinda-200 hover:bg-guinda-50/50 text-gray-600'
                  }`}
                >
                  <span className="font-medium">{u.nombre}</span>
                  <span className="text-gray-400 ml-1.5">{u.dg}</span>
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    u.rol === 'Ejecutivo' ? 'bg-purple-100 text-purple-600' :
                    u.rol === 'Directivo' ? 'bg-blue-100 text-blue-600' :
                    u.rol === 'Responsable' ? 'bg-green-100 text-green-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{u.rol}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
