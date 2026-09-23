/**
 * ARCHIVO: GraficaIndicador.jsx
 * PROPÓSITO: Gráfica del desglose de un indicador — por periodos o por
 *            categorías, misma forma de datos ({etiqueta, meta, real}).
 *            Generaliza el <BarChart> que antes vivía inline en
 *            PanoramaProyecto.jsx (solo para periodos) para reusarlo
 *            también con categorías y con el tipo de gráfica que el
 *            usuario eligió por indicador (tipo_grafico: barras/dona).
 *
 * MINI-CLASE: por qué la dona no muestra "meta"
 * ─────────────────────────────────────────────────────────────────
 * Una dona representa partes de un todo — funciona bien para "cuánto
 * aporta cada fila al total realizado", pero no para comparar meta
 * contra real al mismo tiempo (eso es lo que la barra agrupada sí hace
 * bien). Para 'dona' se grafica solo "real" por fila, con el total y
 * el % de cada una como leyenda de texto.
 * ─────────────────────────────────────────────────────────────────
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const GUINDA_LIGHT = '#9f2241';
// Mismos tonos institucionales (guinda/dorado/verde) ya usados en otras
// partes de la plataforma, en vez de un set de colores nuevo sin relación.
const COLORES_DONA = ['#7B1C3E', '#9f2241', '#c2185b', '#e0aabb', '#bc955c', '#a57f2c', '#13322e'];

export default function GraficaIndicador({ filas, tipo = 'barras' }) {
  if (!filas || filas.length === 0) return null;

  if (tipo === 'dona') {
    const datos = filas.map(f => ({ nombre: f.etiqueta, valor: f.real }));
    const total = datos.reduce((s, d) => s + d.valor, 0);
    return (
      <div className="mt-2">
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
                {datos.map((_, i) => <Cell key={i} fill={COLORES_DONA[i % COLORES_DONA.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => Number(v).toLocaleString('es-MX')} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {datos.map((d, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_DONA[i % COLORES_DONA.length] }} />
              {d.nombre}: {d.valor.toLocaleString('es-MX')}{total > 0 ? ` (${Math.round(d.valor / total * 100)}%)` : ''}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-24 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} barGap={2}>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} />
          <YAxis hide />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="meta" fill="#e5e7eb" name="Meta" radius={[2, 2, 0, 0]} />
          <Bar dataKey="real" fill={GUINDA_LIGHT} name="Real" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
