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
import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

const DEMO_USERS = [
  { correo: 'jesus.paredes@sedatu.gob.mx',     nombre: 'Jesús Paredes',           rol_global: 'superadmin', dg: 'DGOTU'    },
  { correo: 'subsecretario@sedatu.gob.mx',      nombre: 'Alejandro Ríos Montoya',  rol_global: 'ejecutivo',  dg: 'DGOTU'    },
  { correo: 'pablo.director@sedatu.gob.mx',     nombre: 'Pablo Hernández Rivas',   rol_global: 'direccion',  dg: 'DGOTU'    },
  { correo: 'ana.garcia@sedatu.gob.mx',         nombre: 'Ana García López',        rol_global: 'direccion',  dg: 'DGTIC'    },
  { correo: 'enlace.dgomr@sedatu.gob.mx',       nombre: 'Laura Méndez Castillo',   rol_global: 'enlace',     dg: 'DGOMR'    },
  { correo: 'enlace.dgpv@sedatu.gob.mx',        nombre: 'Roberto Sánchez Fuentes', rol_global: 'enlace',     dg: 'DGPV'     },
  { correo: 'enlace.ran@sedatu.gob.mx',         nombre: 'Mónica Torres Vega',      rol_global: 'enlace',     dg: 'DGOTU'    },
  { correo: 'f.espinoza@sedatu.gob.mx',         nombre: 'Fernando Espinoza Leal',  rol_global: 'enlace',     dg: 'DGGIRDCC' },
  { correo: 'c.jimenez@sedatu.gob.mx',          nombre: 'Carlos Jiménez Peña',     rol_global: 'enlace',     dg: 'DGIE'     },
  { correo: 'i.castillo@sedatu.gob.mx',         nombre: 'Iván Castillo Domínguez', rol_global: 'enlace',     dg: 'DGOMR'    },
  { correo: 'v.campos@sedatu.gob.mx',           nombre: 'Valeria Campos Duarte',   rol_global: 'enlace',     dg: 'DGICAM'   },
  { correo: 'roberto.sanchez@sedatu.gob.mx',    nombre: 'Roberto Sánchez Medina',  rol_global: 'enlace',     dg: 'DGOTU'    },
  { correo: 's.gutierrez@sedatu.gob.mx',        nombre: 'Sofía Gutiérrez Ávila',   rol_global: 'enlace',     dg: 'DGTIC'    },
  { correo: 'c.ramirez@sedatu.gob.mx',          nombre: 'Claudia Ramírez Ortega',  rol_global: 'enlace',     dg: 'DGPTM'    },
  { correo: 'miguel.reyes@sedatu.gob.mx',       nombre: 'Miguel Ángel Reyes',      rol_global: 'enlace',     dg: 'DGPTM'    },
  { correo: 'p.luna@sedatu.gob.mx',             nombre: 'Patricia Luna Serrano',   rol_global: 'enlace',     dg: 'DGRPE'    },
  { correo: 'a.vazquez@sedatu.gob.mx',          nombre: 'Adriana Vázquez Moreno',  rol_global: 'enlace',     dg: 'DGIMRC'   },
  { correo: 'carlos.hernandez@sedatu.gob.mx',   nombre: 'Carlos Hernández Ruiz',   rol_global: 'enlace',     dg: 'DGPDI'    },
  { correo: 'd.morales@sedatu.gob.mx',          nombre: 'Diego Morales Ibáñez',    rol_global: 'enlace',     dg: 'DGPP'     },
  { correo: 'h.reyes@sedatu.gob.mx',            nombre: 'Héctor Reyes Blanco',     rol_global: 'enlace',     dg: 'DGTN'     },
  { correo: 'laura.jimenez@sedatu.gob.mx',      nombre: 'Laura Jiménez Vega',      rol_global: 'enlace',     dg: 'DGPV'     },
  { correo: 'maria.torres@sedatu.gob.mx',       nombre: 'María Fernanda Torres',   rol_global: 'enlace',     dg: 'DGCOR'    },
  { correo: 'patricia.olvera@sedatu.gob.mx',    nombre: 'Patricia Olvera Díaz',    rol_global: 'enlace',     dg: 'DGOMR'    },
  { correo: 'fernando.castillo@sedatu.gob.mx',  nombre: 'Fernando Castillo Mora',  rol_global: 'externo',    dg: 'DGGIRDCC' },
];

const ROL_CONFIG = {
  superadmin: { label: 'Superadmin',  cls: 'bg-red-100 text-red-700'      },
  ejecutivo:  { label: 'Ejecutivo',   cls: 'bg-purple-100 text-purple-700' },
  direccion:  { label: 'Dirección',   cls: 'bg-blue-100 text-blue-700'     },
  enlace:     { label: 'Enlace',      cls: 'bg-green-100 text-green-700'   },
  externo:    { label: 'Externo',     cls: 'bg-orange-100 text-orange-700' },
};

export default function Login() {
  const { login } = useAuth();
  const { mostrarToast } = useUI();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return DEMO_USERS.filter(u =>
      !q || u.nombre.toLowerCase().includes(q) || u.dg.toLowerCase().includes(q) || u.rol_global.includes(q)
    );
  }, [busqueda]);

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
      <div className="hidden lg:flex lg:w-1/2 text-white flex-col justify-center items-center p-12" style={{ backgroundColor: '#7B1C3E' }}>
        <div className="max-w-sm text-center">
          <img
            src="/sedatu-logo.png"
            alt="SEDATU"
            className="mx-auto mb-8"
            style={{ width: 220, filter: 'brightness(0) invert(1)' }}
          />
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Noto Sans' }}>PSPP v2.0</h1>
          <p className="text-lg mb-1" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'Noto Sans' }}>
            Plataforma de Seguimiento de Proyectos Prioritarios
          </p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Secretaría de Desarrollo Agrario, Territorial y Urbano
          </p>
          <div className="mt-10 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Sistema de uso interno exclusivo de SEDATU.
              Acceso restringido a personal autorizado.
            </p>
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: '#F5F5F0' }}>
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <img
              src="/sedatu-logo.png"
              alt="SEDATU"
              className="mx-auto mb-3 w-40 object-contain"
            />
            <h1 className="text-xl font-bold" style={{ color: '#7B1C3E' }}>PSPP v2.0</h1>
            <p className="text-sm" style={{ color: '#545454' }}>Plataforma de Seguimiento de Proyectos Prioritarios</p>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: '#545454' }}>Iniciar sesión</h2>
          <p className="text-sm mb-8" style={{ color: '#98989A' }}>Ingresa con tu correo institucional</p>

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
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">
                Usuarios demo <span className="font-mono text-gray-500 bg-gray-100 px-1 rounded">demo2026</span>
              </p>
              <span className="text-[10px] text-gray-400">{DEMO_USERS.length} usuarios</span>
            </div>

            {/* Buscador */}
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Filtrar por nombre o DG…"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:border-guinda-300 bg-gray-50"
            />

            {/* Lista scrollable */}
            <div className="border border-gray-100 rounded-lg overflow-y-auto" style={{ maxHeight: 260 }}>
              {usuariosFiltrados.map(u => {
                const cfg = ROL_CONFIG[u.rol_global] || { label: u.rol_global, cls: 'bg-gray-100 text-gray-500' };
                const activo = correo === u.correo;
                return (
                  <button
                    key={u.correo}
                    type="button"
                    onClick={() => { setCorreo(u.correo); setPassword('demo2026'); }}
                    className={`w-full flex items-center gap-2 text-left px-3 py-2 border-b last:border-0 text-xs transition-colors ${
                      activo
                        ? 'bg-guinda-50 border-l-2 border-l-guinda-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-600">
                      {u.nombre.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${activo ? 'text-guinda-700' : 'text-gray-700'}`}>{u.nombre}</p>
                      <p className="text-gray-400 truncate">{u.dg}</p>
                    </div>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
