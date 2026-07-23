/**
 * ARCHIVO: SolicitarRecuperacion.jsx
 * PROPÓSITO: Página pública donde el usuario pide un enlace para
 *            restablecer su contraseña. Mismo layout visual que Login.jsx.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import emailjs from '@emailjs/browser';
import * as authApi from '../api/auth';

// Envía el correo de recuperación vía EmailJS — mismo patrón que
// enviarCorreoInvitacion en AdminCatalogos.jsx, pero usando la config
// pública alcanzable sin sesión (GET /auth/config-correo).
async function enviarCorreoRecuperacion(nombre, correo, resetLink) {
  try {
    const json = await authApi.obtenerConfigCorreoPublico();
    const cfg = json.datos || {};
    if (cfg.emailjs_enabled !== 'true') return;
    const { emailjs_service_id: svcId, emailjs_template_id: tplId, emailjs_public_key: pubKey } = cfg;
    if (!svcId || !tplId || !pubKey) return;
    await emailjs.send(svcId, tplId, {
      to_name: nombre,
      to_email: correo,
      invite_link: resetLink,
    }, pubKey);
  } catch (err) {
    console.error('Error enviando correo de recuperación:', err);
  }
}

export default function SolicitarRecuperacion() {
  const [correo, setCorreo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await authApi.solicitarRecuperacion(correo);
      if (res.enviar) {
        await enviarCorreoRecuperacion(res.nombre, res.correo, res.reset_link);
      }
      setEnviado(true);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Ocurrió un error. Intenta de nuevo.');
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
          {enviado ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={22} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#2D2D2D' }}>Revisa tu correo</h2>
              <p className="text-sm mb-8" style={{ color: '#98989A' }}>
                Si el correo está registrado, recibirás un enlace de recuperación en los próximos minutos.
              </p>
              <Link to="/" className="text-sm font-medium text-guinda-600 hover:text-guinda-700">
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1" style={{ color: '#2D2D2D' }}>Recuperar contraseña</h2>
                <p className="text-sm" style={{ color: '#98989A' }}>
                  Ingresa tu correo institucional y te enviaremos un enlace para restablecerla.
                </p>
              </div>

              <form onSubmit={manejarSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

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

                <button
                  type="submit"
                  disabled={cargando || !correo}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: cargando ? '#9B3A5B' : '#7B1C3E' }}
                  onMouseEnter={e => { if (!cargando) e.currentTarget.style.backgroundColor = '#6A1835'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = cargando ? '#9B3A5B' : '#7B1C3E'; }}
                >
                  {cargando && <Loader2 size={15} className="animate-spin" />}
                  {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>

              <p className="mt-8 text-center text-sm">
                <Link to="/" className="font-medium text-guinda-600 hover:text-guinda-700">
                  Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
