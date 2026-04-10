/**
 * ARCHIVO: SubirEvidenciaModal.jsx
 * PROPÓSITO: Modal para subir evidencias a una acción o riesgo.
 *
 * MINI-CLASE: Subida de archivos con drag & drop
 * ─────────────────────────────────────────────────────────────────
 * Este modal permite seleccionar un archivo desde el explorador o
 * arrastrarlo sobre la zona de drop. Al seleccionar, el usuario
 * elige la categoría (Geoespacial, Estudios, Scripts, etc.) y
 * opcionalmente agrega notas. Al confirmar, se llama a la API de
 * evidencias que usa FormData para enviar el archivo al backend.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef } from 'react';
import { Upload, X, FileText } from 'lucide-react';

const categorias = [
  'Planos', 'Oficios', 'Minutas', 'Estudios', 'Fotografias',
  'Contratos', 'Geoespacial', 'Scripts', 'Reportes', 'Otro'
];

export default function SubirEvidenciaModal({ abierto, onCerrar, onSubir, cargando }) {
  const [archivo, setArchivo] = useState(null);
  const [categoria, setCategoria] = useState('Otro');
  const [notas, setNotas] = useState('');
  const inputRef = useRef(null);

  if (!abierto) return null;

  const manejarDrop = (e) => {
    e.preventDefault();
    const archivoDropped = e.dataTransfer.files[0];
    if (archivoDropped) setArchivo(archivoDropped);
  };

  const manejarSubir = () => {
    if (!archivo) return;
    onSubir(archivo, { categoria, notas });
  };

  const limpiar = () => {
    setArchivo(null);
    setCategoria('Otro');
    setNotas('');
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={limpiar} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Subir evidencia</h3>
          <button onClick={limpiar} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Zona de drop */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={manejarDrop}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-guinda-400 hover:bg-guinda-50 transition-colors mb-4"
        >
          {archivo ? (
            <div className="flex items-center justify-center gap-3">
              <FileText size={24} className="text-guinda-500" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{archivo.name}</p>
                <p className="text-xs text-gray-500">{(archivo.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Arrastra un archivo o haz click para seleccionar</p>
              <p className="text-xs text-gray-400 mt-1">Máximo 200MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={e => setArchivo(e.target.files[0])}
          />
        </div>

        {/* Categoría */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="input-base"
          >
            {categorias.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Notas */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            className="input-base resize-none"
            placeholder="Descripción breve del archivo..."
          />
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3">
          <button onClick={limpiar} className="btn-secondary">Cancelar</button>
          <button
            onClick={manejarSubir}
            disabled={!archivo || cargando}
            className="btn-primary"
          >
            {cargando ? 'Subiendo...' : 'Subir evidencia'}
          </button>
        </div>
      </div>
    </div>
  );
}
