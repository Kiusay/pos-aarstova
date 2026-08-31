'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { Pedido, GastoCaja } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function ReportesPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [rango, setRango] = useState<'hoy' | 'semana' | 'mes' | 'anio'>('mes');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [gastos, setGastos] = useState<GastoCaja[]>([]);
  const [loading, setLoading] = useState(true);

  const hasAccess = sesion?.tienePermiso('reportes');

  useEffect(() => {
    if (hasAccess) {
      cargarReportes();
    }
  }, [rango, sesion]);

  const cargarReportes = async () => {
    setLoading(true);

    const now = new Date();
    let desde = new Date();

    if (rango === 'hoy') {
      desde.setHours(0, 0, 0, 0);
    } else if (rango === 'semana') {
      desde.setDate(now.getDate() - 7);
    } else if (rango === 'mes') {
      desde.setMonth(now.getMonth() - 1);
    } else if (rango === 'anio') {
      desde.setFullYear(now.getFullYear() - 1);
    }

    const isoDesde = desde.toISOString();

    const { data: dataPed } = await supabase
      .from('pedidos')
      .select('*, detalle:detalle_pedido(*, plato:platos(*))')
      .gte('fecha_creacion', isoDesde)
      .eq('estado_pago', 'pagado');

    if (dataPed) setPedidos(dataPed as Pedido[]);

    const { data: dataGas } = await supabase
      .from('gastos_caja')
      .select('*')
      .gte('fecha', isoDesde);

    if (dataGas) setGastos(dataGas as GastoCaja[]);

    setLoading(false);
  };

  // Cálculos principales
  const totalVentas = pedidos.reduce((acc, p) => acc + p.total, 0);
  const totalEfectivo = pedidos.reduce((acc, p) => acc + (p.monto_efectivo || 0), 0);
  const totalTransferencias = pedidos.reduce((acc, p) => acc + (p.monto_transferencia || 0), 0);
  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
  const gananciaNeta = totalVentas - totalGastos;

  // Datos para gráfico de barras por fecha
  const mapFechas: { [fecha: string]: { fecha: string; ventas: number; gastos: number } } = {};
  pedidos.forEach(p => {
    const f = new Date(p.fecha_creacion).toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    if (!mapFechas[f]) mapFechas[f] = { fecha: f, ventas: 0, gastos: 0 };
    mapFechas[f].ventas += p.total;
  });
  gastos.forEach(g => {
    const f = new Date(g.fecha).toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    if (!mapFechas[f]) mapFechas[f] = { fecha: f, ventas: 0, gastos: 0 };
    mapFechas[f].gastos += g.monto;
  });
  const dataGraficoBarras = Object.values(mapFechas).reverse();

  // Datos para Pie Chart (Método de Pago)
  const dataPie = [
    { name: 'Efectivo', value: totalEfectivo, color: 'var(--orange)' },
    { name: 'Transferencia', value: totalTransferencias, color: 'var(--status-prep)' }
  ];

  // Top platos más vendidos
  const mapPlatos: { [id: string]: { nombre: string; cantidad: number; total: number } } = {};
  pedidos.forEach(p => {
    p.detalle?.forEach(d => {
      const nombre = d.plato?.nombre || 'Plato';
      if (!mapPlatos[nombre]) mapPlatos[nombre] = { nombre, cantidad: 0, total: 0 };
      mapPlatos[nombre].cantidad += d.cantidad;
      mapPlatos[nombre].total += d.subtotal;
    });
  });
  const topPlatos = Object.values(mapPlatos).sort((a, b) => b.cantidad - a.cantidad).slice(0, 7);

  // Exportar CSV Ventas
  const exportarCSVVentas = () => {
    const headers = ['ID Pedido', 'Numero', 'Fecha', 'Tipo', 'Estado Pago', 'Total COP'];
    const rows = pedidos.map(p => [
      p.id,
      p.numero_pedido,
      new Date(p.fecha_creacion).toLocaleString('es-CO'),
      p.tipo,
      p.estado_pago,
      p.total
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ventas_Aarstova_${rango}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasAccess) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permisos para ver el módulo de reportes.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">📊 Reportes y Estadísticas</h1>
          <p className="page-subtitle">Análisis financiero, ventas y platos más pedidos</p>
        </div>
        <button className="btn btn-neutral" onClick={exportarCSVVentas}>
          📄 Exportar Ventas CSV
        </button>
      </div>

      {/* Filtro Rango */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button className={`tab-btn ${rango === 'hoy' ? 'active' : ''}`} onClick={() => setRango('hoy')}>Hoy</button>
        <button className={`tab-btn ${rango === 'semana' ? 'active' : ''}`} onClick={() => setRango('semana')}>Última Semana</button>
        <button className={`tab-btn ${rango === 'mes' ? 'active' : ''}`} onClick={() => setRango('mes')}>Último Mes</button>
        <button className={`tab-btn ${rango === 'anio' ? 'active' : ''}`} onClick={() => setRango('anio')}>Último Año</button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '300px' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Métricas Principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ventas Totales</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--orange-dark)' }}>
                ${totalVentas.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Efectivo</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                ${totalEfectivo.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Transferencias</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                ${totalTransferencias.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Gastos</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--status-cancel)' }}>
                -${totalGastos.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center', border: '2px solid var(--status-ready)' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Ganancia Neta</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--status-ready)' }}>
                ${gananciaNeta.toLocaleString('es-CO')}
              </div>
            </div>
          </div>

          {/* Gráficas */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            {/* Gráfico de Barras: Ventas vs Gastos */}
            <div className="nm-card">
              <h3 className="section-title">📈 Ventas vs Gastos por Fecha</h3>
              <div style={{ width: '100%', height: 300, marginTop: '1rem' }}>
                <ResponsiveContainer>
                  <BarChart data={dataGraficoBarras}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" />
                    <YAxis />
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
                    <Legend />
                    <Bar dataKey="ventas" fill="var(--orange)" name="Ventas" />
                    <Bar dataKey="gastos" fill="var(--status-cancel)" name="Gastos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart: Método de Pago */}
            <div className="nm-card">
              <h3 className="section-title">💳 Método de Pago</h3>
              <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={dataPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {dataPie.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Platos Vendidos */}
          <div className="nm-card">
            <h3 className="section-title">🏆 Top Platos Más Vendidos</h3>
            {topPlatos.length === 0 ? (
              <p className="text-muted">No hay platos registrados en este período.</p>
            ) : (
              <table className="nm-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Plato</th>
                    <th>Unidades Vendidas</th>
                    <th>Ingresos Generados</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlatos.map((p, idx) => (
                    <tr key={idx}>
                      <td><strong>#{idx + 1} {p.nombre}</strong></td>
                      <td><span className="badge badge-info">{p.cantidad} unidades</span></td>
                      <td style={{ fontWeight: 'bold', color: 'var(--orange-dark)' }}>
                        ${p.total.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
