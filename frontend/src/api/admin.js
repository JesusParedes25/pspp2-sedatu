/**
 * API client para endpoints de administración (superadmin).
 */
import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1' });

API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('pspp_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ─── Catálogos ─────────────────────────────────────────────────
export async function listarCatalogos() {
  const { data } = await API.get('/admin/catalogos');
  return data;
}

export async function agregarValor(tipo, valor, descripcion) {
  const { data } = await API.post('/admin/catalogos', { tipo, valor, descripcion });
  return data;
}

export async function editarValor(id, campos) {
  const { data } = await API.put(`/admin/catalogos/${id}`, campos);
  return data;
}

export async function desactivarValor(id) {
  const { data } = await API.delete(`/admin/catalogos/${id}`);
  return data;
}

export async function reactivarValor(id) {
  const { data } = await API.patch(`/admin/catalogos/${id}/reactivar`);
  return data;
}

// ─── Geografía ─────────────────────────────────────────────────
export async function obtenerZonasMetropolitanas() {
  const { data } = await API.get('/admin/geo/zonas-metropolitanas');
  return data;
}

export async function reemplazarShapefile(capa, archivo) {
  const form = new FormData();
  form.append('archivo', archivo);
  const { data } = await API.post(`/admin/geo/reemplazar/${capa}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ─── Usuarios ──────────────────────────────────────────────────
export async function listarUsuariosAdmin() {
  const { data } = await API.get('/admin/usuarios');
  return data;
}
export async function crearUsuarioAdmin(datos) {
  const { data } = await API.post('/admin/usuarios', datos);
  return data;
}
export async function editarUsuarioAdmin(id, datos) {
  const { data } = await API.put(`/admin/usuarios/${id}`, datos);
  return data;
}
export async function toggleUsuarioAdmin(id) {
  const { data } = await API.patch(`/admin/usuarios/${id}/toggle`);
  return data;
}
export async function eliminarUsuarioAdmin(id) {
  const { data } = await API.delete(`/admin/usuarios/${id}`);
  return data;
}
export async function reenviarInvitacion(id) {
  const { data } = await API.post(`/admin/usuarios/${id}/reenviar-invitacion`);
  return data;
}

// ─── Áreas ─────────────────────────────────────────────────────
export async function listarDGsAdmin() {
  const { data } = await API.get('/admin/areas/dgs');
  return data;
}
export async function crearDGAdmin(datos) {
  const { data } = await API.post('/admin/areas/dgs', datos);
  return data;
}
export async function editarDGAdmin(id, datos) {
  const { data } = await API.put(`/admin/areas/dgs/${id}`, datos);
  return data;
}
export async function listarDAsAdmin() {
  const { data } = await API.get('/admin/areas/das');
  return data;
}
export async function crearDAAdmin(datos) {
  const { data } = await API.post('/admin/areas/das', datos);
  return data;
}
export async function editarDAAdmin(id, datos) {
  const { data } = await API.put(`/admin/areas/das/${id}`, datos);
  return data;
}

// ─── Configuración ─────────────────────────────────────────────
export async function obtenerConfig() {
  const { data } = await API.get('/admin/config');
  return data;
}
export async function actualizarConfig(items) {
  const { data } = await API.put('/admin/config', { items });
  return data;
}
export async function obtenerConfigPublico() {
  const { data } = await API.get('/admin/config/publico');
  return data;
}
