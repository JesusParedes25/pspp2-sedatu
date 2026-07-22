/**
 * ARCHIVO: Login.jsx
 * PROPÓSITO: Página de inicio de sesión institucional — diseño profesional SEDATU.
 */
import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

export default function Login() {
  const { login } = useAuth();
  const { mostrarToast } = useUI();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
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
      setError(err.response?.data?.mensaje || 'Credenciales incorrectas. Verifica tu correo y contraseña.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F5F5F0' }}>

      {/* ── Panel izquierdo — branding ──────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: '#7B1C3E' }}
      >
        {/* Fondo decorativo */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06 }}>
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border-2 border-white" />
        </div>

        {/* Logo */}
        <div className="relative">
          <img
            src="/sedatu-logo.png"
            alt="SEDATU"
            style={{ width: 180, filter: 'brightness(0) invert(1)', opacity: 0.95 }}
          />
        </div>

        {/* Centro */}
        <div className="relative">
          <img
            src="/logo_pspp2.png"
            alt="PSPP v2.0 - Plataforma de Seguimiento de Proyectos Prioritarios"
            style={{ width: 320, filter: 'brightness(0) invert(1)', opacity: 0.92 }}
          />
        </div>

        {/* Footer */}
        <div className="relative" style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '1.5rem' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Secretaría de Desarrollo Agrario,<br />
            Territorial y Urbano — SEDATU<br />
            Sistema de uso interno exclusivo.
          </p>
        </div>
      </div>

      {/* ── Panel derecho — formulario ──────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-16">

        {/* Logo mobile */}
        <div className="lg:hidden text-center mb-10">
          <img src="/sedatu-logo.png" alt="SEDATU" className="mx-auto mb-3 w-36 object-contain" />
          <img src="/logo_pspp2_blanco.png" alt="PSPP v2.0" className="mx-auto mt-4 w-64 object-contain" />
        </div>

        <div className="w-full max-w-[400px]">
          {/* Encabezado del formulario */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1" style={{ color: '#2D2D2D' }}>Iniciar sesión</h2>
            <p className="text-sm" style={{ color: '#98989A' }}>
              Ingresa con tu correo institucional @sedatu.gob.mx
            </p>
          </div>

          <form onSubmit={manejarSubmit} className="space-y-5">

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Correo */}
            <div>
              <label htmlFor="correo" className="block text-sm font-medium mb-1.5" style={{ color: '#4B4B4B' }}>
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  id="correo"
                  type="email"
                  value={correo}
                  onChange={e => setCorreo(e.target.value)}
                  placeholder="usuario@sedatu.gob.mx"
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-guinda-400 focus:ring-1 focus:ring-guinda-200 transition-colors"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#4B4B4B' }}>
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  id="password"
                  type={mostrarPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                  className="w-full pl-10 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-guinda-400 focus:ring-1 focus:ring-guinda-200 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botón */}
            <button
              type="submit"
              disabled={cargando || !correo || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: cargando ? '#9B3A5B' : '#7B1C3E' }}
              onMouseEnter={e => { if (!cargando) e.currentTarget.style.backgroundColor = '#6A1835'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = cargando ? '#9B3A5B' : '#7B1C3E'; }}
            >
              {cargando && <Loader2 size={15} className="animate-spin" />}
              {cargando ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          {/* Nota de acceso */}
          <p className="mt-8 text-center text-xs" style={{ color: '#B0B0B0' }}>
            Acceso restringido a personal autorizado de SEDATU.<br />
            Si no tienes acceso, solicítalo al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
