/**
 * ARCHIVO: useDescargaArchivo.js
 * PROPÓSITO: Botones "Descargar" de archivos almacenados. Pide el boleto
 *            efímero justo al hacer clic (api/archivos.js) y avisa con un
 *            toast si no se pudo, en vez de un <a href> fijo con el token
 *            de sesión en la URL.
 */
import { useCallback, useState } from 'react';
import * as archivosApi from '../api/archivos';
import { useUI } from '../context/UIContext';
import { mensajeDeError } from '../api/transferencias';

export function useDescargaArchivo() {
  const { mostrarToast } = useUI();
  const [descargando, setDescargando] = useState(false);

  const descargar = useCallback(async (fuente) => {
    if (!fuente) return;
    setDescargando(true);
    try {
      await archivosApi.descargar(fuente);
    } catch (err) {
      const estado = err?.response?.status;
      mostrarToast(
        estado === 403 ? 'No tienes acceso a este archivo.'
          : estado === 404 ? 'El archivo ya no está disponible.'
            : mensajeDeError(err, 'No se pudo iniciar la descarga. Inténtalo de nuevo.'),
        'error'
      );
    } finally {
      setDescargando(false);
    }
  }, [mostrarToast]);

  return { descargar, descargando };
}
