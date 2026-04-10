/**
 * ARCHIVO: AuthContext.jsx
 * PROPÓSITO: Contexto global de autenticación (usuario, login, logout).
 *
 * MINI-CLASE: React Context para estado global
 * ─────────────────────────────────────────────────────────────────
 * React Context permite compartir datos entre componentes sin pasar
 * props manualmente en cada nivel. AuthContext almacena el usuario
 * autenticado, el token JWT y las funciones login/logout. Cualquier
 * componente puede acceder con useAuth(). Al montar, verifica si
 * hay un token en localStorage para restaurar la sesión después de
 * recargar la página.
 * ─────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al montar, verificar si hay una sesión guardada en localStorage
  useEffect(() => {
    const token = localStorage.getItem('pspp_token');
    const usuarioGuardado = localStorage.getItem('pspp_usuario');

    if (token && usuarioGuardado) {
      try {
        setUsuario(JSON.parse(usuarioGuardado));
      } catch {
        // Si el JSON es inválido, limpiar localStorage
        localStorage.removeItem('pspp_token');
        localStorage.removeItem('pspp_usuario');
      }
    }
    setCargando(false);
  }, []);

  // Iniciar sesión: enviar credenciales al backend y guardar respuesta
  async function login(correo, password) {
    const respuesta = await authApi.login(correo, password);
    const { token, usuario: datosUsuario } = respuesta.datos;

    localStorage.setItem('pspp_token', token);
    localStorage.setItem('pspp_usuario', JSON.stringify(datosUsuario));
    setUsuario(datosUsuario);

    return datosUsuario;
  }

  // Cerrar sesión: limpiar token y redirigir
  function logout() {
    localStorage.removeItem('pspp_token');
    localStorage.removeItem('pspp_usuario');
    setUsuario(null);
  }

  const valor = {
    usuario,
    cargando,
    login,
    logout,
    estaAutenticado: !!usuario
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
