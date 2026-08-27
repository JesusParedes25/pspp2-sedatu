/**
 * ARCHIVO: TabApiIndicadores.jsx
 * PROPÓSITO: Administrar desde el panel los accesos de la API que
 *            consume el tablero ejecutivo externo — sin tocar código
 *            ni variables de entorno para dar, rotar o revocar uno.
 *
 * MINI-CLASE: el token se muestra una sola vez
 * ─────────────────────────────────────────────────────────────────
 * En la base solo vive el hash del token, nunca el valor. Eso
 * significa que ni esta pantalla puede recuperarlo después: se
 * muestra al crearlo y ya. Si se pierde, se revoca y se emite otro —
 * que es exactamente lo que uno quiere que pase, porque implica que
 * un volcado de la base no entrega credenciales usables.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Copy, Check, Trash2, KeyRound, X, AlertTriangle } from 'lucide-react';
import * as adminApi from '../../api/admin';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';

function Campo({ etiqueta, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{etiqueta}</label>
      {children}
    </div>
  );
}

export default function TabApiIndicadores() {
  const [tokens, setTokens] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', descripcion: '' });
  const [recienCreado, setRecienCreado] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [porRevocar, setPorRevocar] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await adminApi.listarApiTokens();
      setTokens(res.datos || []);
    } catch {
      setError('No se pudieron cargar los accesos.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const [crear, guardando] = useEnvioUnico(async () => {
    if (!nuevo.nombre.trim()) return;
    setError('');
    try {
      const res = await adminApi.crearApiToken(nuevo);
      setRecienCreado(res.datos);
      setCreando(false);
      setNuevo({ nombre: '', descripcion: '' });
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo crear el acceso.');
    }
  });

  async function revocar(t) {
    setError('');
    try {
      await adminApi.revocarApiToken(t.id);
      setPorRevocar(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo revocar.');
    }
  }

  const urlApi = `${window.location.origin}/api/v1/publico/indicadores`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">API de indicadores</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Accesos de solo lectura para que otra plataforma (el tablero ejecutivo) consulte el
          avance de los indicadores. Cada acceso se puede revocar por separado sin afectar a los demás.
        </p>
      </div>

      {/* Cómo se consume — para no tener que documentarlo aparte */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-gray-700">Cómo se consume</p>
        <code className="block text-[11px] font-mono text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 break-all">
          GET {urlApi}
        </code>
        <code className="block text-[11px] font-mono text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 break-all">
          Authorization: Bearer &lt;token&gt;
        </code>
        <p className="text-[11px] text-gray-500">
          Devuelve cada indicador del catálogo con su <strong>clave estable</strong>, el total de
          meta y avance sumando todos los proyectos, y el desglose por proyecto con quién capturó
          el dato. Acepta <code className="font-mono">?clave=</code> para pedir uno solo, y también
          el encabezado <code className="font-mono">X-API-Key</code> si la herramienta del otro
          lado no permite Bearer.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {/* El token en claro, una sola vez */}
      {recienCreado && (
        <div className="border-2 border-amber-300 bg-amber-50 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-900">Copia este token ahora</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                No se vuelve a mostrar: en la base solo queda su huella. Si lo pierdes, revócalo y crea otro.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] font-mono bg-white border border-amber-200 rounded px-2 py-1.5 break-all">
              {recienCreado.token}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(recienCreado.token);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
              className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"
            >
              {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
          </div>
          <button onClick={() => setRecienCreado(null)} className="text-[11px] text-amber-700 hover:underline">
            Ya lo copié, ocultar
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setCreando(true)} className="btn-secondary text-sm flex items-center gap-1.5">
          <Plus size={14} /> Nuevo acceso
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8">
          Todavía no hay accesos. Crea uno para que el tablero ejecutivo pueda consultar los indicadores.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {tokens.map(t => (
            <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${t.activo ? '' : 'bg-gray-50/70'}`}>
              <KeyRound size={15} className={`flex-shrink-0 mt-0.5 ${t.activo ? 'text-guinda-600' : 'text-gray-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${t.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                    {t.nombre}
                  </span>
                  {!t.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">revocado</span>}
                </div>
                {t.descripcion && <p className="text-[11px] text-gray-500 mt-0.5">{t.descripcion}</p>}
                <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-gray-400">
                  <code className="font-mono">{t.prefijo}…</code>
                  <span>{t.usos} {t.usos === 1 ? 'consulta' : 'consultas'}</span>
                  <span>
                    {t.ultimo_uso
                      ? `último uso: ${new Date(t.ultimo_uso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`
                      : 'nunca usado'}
                  </span>
                  {t.creador_nombre && <span>creado por {t.creador_nombre}</span>}
                </div>
              </div>
              {t.activo && (
                <button onClick={() => setPorRevocar(t)} title="Revocar"
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Alta */}
      {creando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCreando(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Nuevo acceso a la API</h3>
              <button onClick={() => setCreando(false)} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <Campo etiqueta="¿Para qué es?">
                <input
                  value={nuevo.nombre}
                  onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))}
                  autoFocus
                  placeholder="Ej. Tablero ejecutivo SEDATU"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Un nombre por consumidor: así se puede revocar uno sin dejar sin servicio a los demás.
                </p>
              </Campo>
              <Campo etiqueta="Notas (opcional)">
                <textarea
                  value={nuevo.descripcion}
                  onChange={e => setNuevo(n => ({ ...n, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Contacto responsable, fecha de alta, etc."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
              </Campo>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setCreando(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={crear} disabled={!nuevo.nombre.trim() || guardando} className="btn-primary text-sm disabled:opacity-40">
                {guardando ? 'Creando...' : 'Crear acceso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar revocación */}
      {porRevocar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPorRevocar(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Revocar «{porRevocar.nombre}»</h3>
            <p className="text-xs text-gray-600 mb-4">
              La plataforma que use este token dejará de recibir datos de inmediato. No se puede
              deshacer: habría que crear un acceso nuevo.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPorRevocar(null)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => revocar(porRevocar)}
                className="text-sm px-3 py-1.5 rounded-lg text-white bg-red-600 hover:bg-red-700">
                Revocar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
