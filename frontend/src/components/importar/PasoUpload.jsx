/**
 * ARCHIVO: PasoUpload.jsx
 * PROPÓSITO: Paso 0 del wizard — subir archivo CSV/XLSX.
 */
import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import * as importarApi from '../../api/importar';

const FORMATOS_ACEPTADOS = '.csv,.tsv,.txt,.xlsx,.xls';
const MAX_SIZE_MB = 10;

export default function PasoUpload({ onExito, error, setError }) {
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef(null);

  const procesarArchivo = async (file) => {
    if (!file) return;

    // Validar tamaño
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`El archivo excede el límite de ${MAX_SIZE_MB} MB.`);
      return;
    }

    // Validar extensión
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'tsv', 'txt', 'xlsx', 'xls'].includes(ext)) {
      setError('Formato no soportado. Use .csv, .tsv, .txt o .xlsx');
      return;
    }

    setSubiendo(true);
    setError(null);
    try {
      const resultado = await importarApi.uploadArchivo(file);
      onExito(resultado.datos);
    } catch (e) {
      setError(e.response?.data?.mensaje || 'Error al subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files[0];
    procesarArchivo(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setArrastrando(true);
  };

  const onDragLeave = () => setArrastrando(false);

  const onSeleccionar = (e) => {
    const file = e.target.files[0];
    procesarArchivo(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Subir archivo de estructura</h3>
        <p className="text-xs text-gray-500">
          Formatos: CSV, TSV, XLSX. Máximo {MAX_SIZE_MB} MB.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          arrastrando
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
        }`}
      >
        {subiendo ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600">Subiendo y parseando archivo...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <FileSpreadsheet size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Arrastra tu archivo aquí o haz click para seleccionarlo
              </p>
              <p className="text-xs text-gray-400 mt-1">
                CSV, TSV, TXT o Excel (.xlsx)
              </p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={FORMATOS_ACEPTADOS}
          onChange={onSeleccionar}
          className="hidden"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
