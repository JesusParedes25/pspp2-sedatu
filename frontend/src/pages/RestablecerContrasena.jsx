/**
 * ARCHIVO: RestablecerContrasena.jsx
 * PROPÓSITO: Página pública donde el usuario define su nueva contraseña
 *            usando el token de recuperación enviado por correo. Mismo
 *            layout visual que Login.jsx.
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useUI } from '../context/UIContext';
import * as authApi from '../api/auth';

export default function RestablecerContrasena() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { mostrarToast } = useUI();
  const token = params.get('token');

  const [validando, setValidando] = useState(true);
  const [valido, setValido] = useState(false);
  const [nombre, setNombre] = useState('');

  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});

  useEffect(() => {
    (async () => {
      if (!token) { setValido(false); setValidando(false); return; }
      try {
        const res = await authApi.validarTokenRecuperacion(token);
        setValido(!!res.valid);
        setNombre(res.nombre || '');
      } catch {
        setValido(false);
      } finally {
        setValidando(false);
      }
    })();
  }, [token]);

  function validar() {
    const e = {};
    if (password.length < 8) e.password = 'Debe tener al menos 8 caracteres.';
    if (password !== confirmar) e.confirmar = 'Las contraseñas no coinciden.';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function manejarSubmit(ev) {
    ev.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      await authApi.restablecerContrasena(token, password);
      mostrarToast('Contraseña actualizada. Inicia sesión con tu nueva contraseña.', 'exito');
      navigate('/');
    } catch (err) {
      setErrores({ _general: err.response?.data?.mensaje || 'Error al guardar la contraseña.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F5F5F0' }}>

      {/* ── Panel izquierdo — branding ──────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: '#7B1C3E' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06 }}>
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border-2 border-white" />
        </div>

        <div className="relative">
          <img
            src="/sedatu-logo.png"
            alt="SEDATU"
            style={{ width: 360, filter: 'brightness(0) invert(1)', opacity: 0.95 }}
          />
        </div>

        <div className="relative">
          <img
            src="/logo_pspp2.png"
            alt="PSPP v2.0 - Plataforma de Seguimiento de Proyectos Prioritarios"
            style={{ width: 640, filter: 'brightness(0) invert(1)', opacity: 0.92 }}
          />
        </div>

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

        <div className="lg:hidden text-center mb-10">
          <img src="/sedatu-logo.png" alt="SEDATU" className="mx-auto mb-3 w-36 object-contain" />
          <img src="/logo_pspp2_blanco.png" alt="PSPP v2.0" className="mx-auto mt-4 w-64 object-contain" />
        </div>

        <div className="w-full max-w-[400px]">
          {validando ? (
            <div className="text-center py-10">
              <Loader2 size={24} className="animate-spin text-guinda-500 mx-auto" />
            </div>
          ) : !valido ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={22} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#2D2D2D' }}>Enlace no válido</h2>
              <p className="text-sm mb-8" style={{ color: '#98989A' }}>
                Este enlace ha expirado o ya fue utilizado.
              </p>
              <Link
                to="/solicitar-recuperacion"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: '#7B1C3E' }}
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1" style={{ color: '#2D2D2D' }}>Crear nueva contraseña</h2>
                <p className="text-sm" style={{ color: '#98989A' }}>
                  Hola, {nombre}. Define tu nueva contraseña.
                </p>
              </div>

              <form onSubmit={manejarSubmit} className="space-y-5">
                {errores._general && (
                  <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{errores._general}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#4B4B4B' }}>
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      id="password"
                      type={mostrarPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      autoFocus
                      className={`w-full pl-10 pr-11 py-2.5 text-sm border rounded-xl bg-white focus:outline-none focus:ring-1 transition-colors ${
                        errores.password ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-guinda-400 focus:ring-guinda-200'
                      }`}
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
                  {errores.password && <p className="text-xs text-red-600 mt-1">{errores.password}</p>}
                </div>

                <div>
                  <label htmlFor="confirmar" className="block text-sm font-medium mb-1.5" style={{ color: '#4B4B4B' }}>
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      id="confirmar"
                      type={mostrarPass ? 'text' : 'password'}
                      value={confirmar}
                      onChange={e => setConfirmar(e.target.value)}
                      placeholder="Repite la contraseña"
                      required
                      className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl bg-white focus:outline-none focus:ring-1 transition-colors ${
                        errores.confirmar ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-guinda-400 focus:ring-guinda-200'
                      }`}
                    />
                  </div>
                  {errores.confirmar && <p className="text-xs text-red-600 mt-1">{errores.confirmar}</p>}
                </div>

                <button
                  type="submit"
                  disabled={guardando || !password || !confirmar}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: guardando ? '#9B3A5B' : '#7B1C3E' }}
                  onMouseEnter={e => { if (!guardando) e.currentTarget.style.backgroundColor = '#6A1835'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = guardando ? '#9B3A5B' : '#7B1C3E'; }}
                >
                  {guardando && <Loader2 size={15} className="animate-spin" />}
                  {guardando ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
