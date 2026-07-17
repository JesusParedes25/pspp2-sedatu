/**
 * ARCHIVO: ActivarCuenta.jsx
 * PROPÓSITO: Página pública para que el usuario establezca su contraseña
 *            usando el token de activación enviado por correo.
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import client from '../api/client';

export default function ActivarCuenta() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [estado, setEstado] = useState('idle'); // idle | loading | ok | error
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!token) {
      setEstado('error');
      setMensaje('No se encontró el token de activación. Solicita un nuevo enlace al administrador.');
    }
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      setMensaje('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setMensaje('Las contraseñas no coinciden.');
      return;
    }
    setEstado('loading');
    setMensaje('');
    try {
      const res = await client.post('/auth/activar-cuenta', { token, password });
      setEstado('ok');
      setMensaje(res.data.mensaje || 'Cuenta activada correctamente.');
    } catch (err) {
      setEstado('error');
      setMensaje(err.response?.data?.mensaje || 'Error al activar la cuenta.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-guinda-700 px-8 py-10">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4">
            <KeyRound size={24} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Crear contraseña</h1>
          <p className="text-guinda-200 text-sm mt-1">
            Establece tu contraseña para acceder a la plataforma PSPP.
          </p>
        </div>

        <div className="px-8 py-8">
          {estado === 'ok' ? (
            <div className="text-center space-y-4">
              <CheckCircle size={48} className="text-green-500 mx-auto" />
              <p className="text-gray-700 font-medium">{mensaje}</p>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 bg-guinda-700 text-white rounded-lg font-medium hover:bg-guinda-600 transition-colors"
              >
                Ir al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {mensaje && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  estado === 'error' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                }`}>
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{mensaje}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
                <div className="relative">
                  <input
                    type={mostrar ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    disabled={!token || estado === 'loading'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-guinda-500 disabled:bg-gray-50"
                  />
                  <button type="button" onClick={() => setMostrar(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
                <input
                  type={mostrar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  disabled={!token || estado === 'loading'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-guinda-500 disabled:bg-gray-50"
                />
              </div>

              <button
                type="submit"
                disabled={!token || estado === 'loading' || estado === 'error' && !token}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-guinda-700 text-white rounded-lg font-medium hover:bg-guinda-600 disabled:opacity-50 transition-colors"
              >
                {estado === 'loading' && <Loader2 size={16} className="animate-spin" />}
                Activar cuenta
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
