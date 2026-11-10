/**
 * ARCHIVO: AuthContext.jsx
 * PROPÓSITO: Contexto global de autenticación (usuario, login, logout).
 *
 * NOTA TÉCNICA: React Context para estado global
 * ─────────────────────────────────────────────────────────────────
 * React Context permite compartir datos entre componentes sin pasar
 * props manualmente en cada nivel. AuthContext almacena el usuario
 * autenticado, el token JWT y las funciones login/logout. Cualquier
 * componente puede acceder con useAuth(). Al montar, verifica si
 * hay un token en sessionStorage para restaurar la sesión después de
 * recargar la página.
 * ─────────────────────────────────────────────────────────────────
 *
 * NOTA TÉCNICA: sessionStorage, no localStorage
 * ─────────────────────────────────────────────────────────────────
 * A pedido de la DGTIC (paso 5, sesión por inactividad): el token vive
 * en sessionStorage, que es por PESTAÑA, no por navegador. Consecuencia
 * intencional, no un efecto secundario: abrir la plataforma en una
 * pestaña nueva pide iniciar sesión otra vez, y cerrar la pestaña cierra
 * la sesión (recargar la MISMA pestaña, en cambio, conserva la sesión —
 * sessionStorage sobrevive a eso). Antes de este cambio el token vivía
 * en localStorage, compartido por cualquier pestaña del mismo origen
 * indefinidamente. Quien ya tuviera una sesión guardada ahí al momento
 * del despliegue simplemente no la encuentra aquí (sessionStorage
 * arranca vacío en cada pestaña nueva) y ve el login limpio, como si
 * nunca hubiera entrado — nunca un error. Lo único que hace falta es no
 * dejar esas llaves viejas tiradas en localStorage para siempre.
 * ─────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  // Se enciende SOLO cuando login() acaba de completarse en esta pestaña —
  // nunca al restaurar una sesión guardada al recargar la página. Es la
  // señal que usa ModalPendientesInicioSesion para aparecer una vez por
  // inicio de sesión real, no en cada refresh mientras ya se estaba
  // trabajando.
  const [sesionRecienIniciada, setSesionRecienIniciada] = useState(false);
  // Cuándo caduca el token actual por inactividad (ISO, la misma que
  // devuelve el backend en login/renovar) — lo usa useSesionActividad
  // para saber cuándo mostrar el aviso de los 5 minutos. No es un dato de
  // negocio, por eso vive en sessionStorage junto al token, no en la
  // tabla usuarios ni en pspp_usuario.
  const [expiraEn, setExpiraEn] = useState(() => sessionStorage.getItem('pspp_token_expira_en'));

  // Al montar, verificar si hay una sesión guardada en sessionStorage
  useEffect(() => {
    // Limpieza de una sola vez: llaves que pudieron quedar en localStorage
    // de antes de este cambio (ver nota técnica arriba). No alimenta la
    // sesión de esta pestaña — solo evita dejarlas ahí para siempre.
    try {
      localStorage.removeItem('pspp_token');
      localStorage.removeItem('pspp_usuario');
    } catch {
      // localStorage puede no estar disponible (modo privado estricto) —
      // no hay nada que limpiar en ese caso.
    }

    const token = sessionStorage.getItem('pspp_token');
    const usuarioGuardado = sessionStorage.getItem('pspp_usuario');

    if (token && usuarioGuardado) {
      try {
        setUsuario(JSON.parse(usuarioGuardado));
      } catch {
        // Si el JSON es inválido, limpiar sessionStorage
        sessionStorage.removeItem('pspp_token');
        sessionStorage.removeItem('pspp_usuario');
        sessionStorage.removeItem('pspp_token_expira_en');
      }
    }
    setCargando(false);
  }, []);

  // Iniciar sesión: enviar credenciales al backend y guardar respuesta
  async function login(correo, password) {
    const respuesta = await authApi.login(correo, password);
    const { token, expiraEn: nuevoExpiraEn, usuario: datosUsuario } = respuesta.datos;

    sessionStorage.setItem('pspp_token', token);
    sessionStorage.setItem('pspp_usuario', JSON.stringify(datosUsuario));
    sessionStorage.setItem('pspp_token_expira_en', nuevoExpiraEn);
    setUsuario(datosUsuario);
    setExpiraEn(nuevoExpiraEn);
    setSesionRecienIniciada(true);

    return datosUsuario;
  }

  // Cambia el token por uno nuevo (actividad real de la persona, o el
  // botón "Seguir conectado" del aviso de expiración) — ver
  // hooks/useSesionActividad.js, que es quien decide CUÁNDO llamar esto.
  // No toca pspp_usuario: el perfil no cambia al renovar.
  async function renovarSesion() {
    const respuesta = await authApi.renovarToken();
    const { token, expiraEn: nuevoExpiraEn } = respuesta.datos;
    sessionStorage.setItem('pspp_token', token);
    sessionStorage.setItem('pspp_token_expira_en', nuevoExpiraEn);
    setExpiraEn(nuevoExpiraEn);
    return nuevoExpiraEn;
  }

  // Cerrar sesión: limpiar token y redirigir
  function logout() {
    sessionStorage.removeItem('pspp_token');
    sessionStorage.removeItem('pspp_usuario');
    sessionStorage.removeItem('pspp_token_expira_en');
    setUsuario(null);
    setExpiraEn(null);
    setSesionRecienIniciada(false);
  }

  const valor = {
    usuario,
    cargando,
    login,
    logout,
    renovarSesion,
    expiraEn,
    estaAutenticado: !!usuario,
    sesionRecienIniciada,
    // El modal de pendientes llama esto en cuanto se muestra (o decide que
    // no tiene nada que mostrar), para que no vuelva a aparecer el resto
    // de la sesión sin que haya un login nuevo de por medio.
    marcarSesionVista: () => setSesionRecienIniciada(false),
  };

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook personalizado para acceder al contexto de autenticación
export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return contexto;
}
