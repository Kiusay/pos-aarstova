'use client';

import { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { Cliente, Pedido } from '@/lib/types';
import Link from 'next/link';

export default function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const clienteId = resolvedParams.id;

  const sesion = useSesion();
  const supabase = createClient();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDetalles();
  }, [clienteId]);

  const cargarDetalles = async () => {
    setLoading(true);

    const { data: dataCli } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clienteId)
      .single();

    if (dataCli) setCliente(dataCli as Cliente);

    const { data: dataPed } = await supabase
      .from('pedidos')
      .select('*, detalle:detalle_pedido(*, plato:platos(*))')
      .eq('cliente_id', clienteId)
      .order('fecha_creacion', { ascending: false });

    if (dataPed) setPedidos(dataPed as Pedido[]);

    setLoading(false);
  };

  if (loading) return <div className="skeleton" style={{ height: '300px' }} />;

  if (!cliente) {
    return (
      <div className="empty-state nm-card">
        <h2>Cliente no encontrado</h2>
        <Link href="/clientes" className="btn btn-neutral" style={{ marginTop: '1rem' }}>⬅️ Volver al directorio</Link>
      </div>
    );
  }

  const totalGastado = pedidos.reduce((acc, p) => acc + p.total, 0);
  const promedioPedido = pedidos.length > 0 ? totalGastado / pedidos.length : 0;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/clientes" className="btn btn-sm btn-ghost" style={{ textDecoration: 'none' }}>
          ⬅️ Volver a Clientes
        </Link>
      </div>

      {/* Header Cliente */}
      <div className="nm-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">{cliente.nombre}</h1>
            <p className="page-subtitle">📞 {cliente.telefono} | 📍 {cliente.direccion || 'Sin dirección'} {cliente.barrio ? `(${cliente.barrio})` : ''}</p>
          </div>
          {cliente.telefono && (
            <a
              href={`https://wa.me/57${cliente.telefono.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-success"
              style={{ textDecoration: 'none' }}
            >
              💬 Iniciar Chat WhatsApp
            </a>
          )}
        </div>

        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
          <div className="nm-inset" style={{ padding: '1rem', textAlign: 'center', borderRadius: '8px' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Total Pedidos</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{pedidos.length}</div>
          </div>
          <div className="nm-inset" style={{ padding: '1rem', textAlign: 'center', borderRadius: '8px' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Total Gastado</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--orange-dark)' }}>
              ${totalGastado.toLocaleString('es-CO')}
            </div>
          </div>
          <div className="nm-inset" style={{ padding: '1rem', textAlign: 'center', borderRadius: '8px' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ticket Promedio</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              ${Math.round(promedioPedido).toLocaleString('es-CO')}
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Pedidos */}
      <div className="nm-card">
        <h3 className="section-title">📜 Historial de Pedidos</h3>
        {pedidos.length === 0 ? (
          <p className="text-muted">Este cliente aún no tiene pedidos registrados.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="nm-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th># Pedido</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Platos Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.fecha_creacion).toLocaleDateString()}</td>
                    <td><strong>#{p.numero_pedido}</strong></td>
                    <td><span className="badge badge-info">{p.tipo}</span></td>
                    <td><span className={`badge badge-${p.estado === 'entregado' ? 'done' : 'pending'}`}>{p.estado}</span></td>
                    <td><strong>${p.total.toLocaleString('es-CO')}</strong></td>
                    <td>
                      <small className="text-muted">
                        {p.detalle?.map(d => `${d.cantidad}x ${d.plato?.nombre}`).join(', ')}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
