'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { Pedido, Usuario } from '@/lib/types';

export default function DomiciliosPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('activos');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const canSeeAll = sesion?.usuario?.rol === 'admin' || sesion?.tienePermiso('domicilios_todos') || sesion?.tienePermiso('admin');
  const canSeeOwn = sesion?.tienePermiso('domicilios_propios');

  useEffect(() => {
    cargarDomicilios();
    cargarDomiciliarios();

    const channel = supabase
      .channel('domicilios-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        cargarDomicilios();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sesion]);

  const cargarDomiciliarios = async () => {
    const { data } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol', 'domiciliario')
      .eq('activo', true);
    if (data) setDomiciliarios(data as Usuario[]);
  };

  const cargarDomicilios = async () => {
    setLoading(true);
    let query = supabase
      .from('pedidos')
      .select('*, cliente:clientes(*), detalle:detalle_pedido(*, plato:platos(*))')
      .eq('tipo', 'domicilio')
      .order('fecha_creacion', { ascending: false });

    if (!canSeeAll && canSeeOwn && sesion?.usuario?.id) {
      query = query.eq('domiciliario_id', sesion.usuario.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else if (data) {
      setPedidos(data as Pedido[]);
    }
    setLoading(false);
  };

  const actualizarEstadoPedido = async (id: string, nuevoEstado: string, nuevoEstadoPago?: string) => {
    const payload: any = { estado: nuevoEstado };
    if (nuevoEstado === 'entregado') payload.fecha_entregado = new Date().toISOString();
    if (nuevoEstadoPago) payload.estado_pago = nuevoEstadoPago;

    const { error } = await supabase.from('pedidos').update(payload).eq('id', id);
    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo actualizar el estado.' });
    } else {
      setMensaje({ tipo: 'exito', texto: `Pedido actualizado a ${nuevoEstado}.` });
      cargarDomicilios();
    }
  };

  const reasignarDomiciliario = async (pedidoId: string, domId: string) => {
    const { error } = await supabase
      .from('pedidos')
      .update({ domiciliario_id: domId || null })
      .eq('id', pedidoId);

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al reasignar domiciliario.' });
    } else {
      setMensaje({ tipo: 'exito', texto: 'Domiciliario reasignado.' });
      cargarDomicilios();
    }
  };

  if (!canSeeAll && !canSeeOwn) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permisos para ver el panel de domicilios.</p>
      </div>
    );
  }

  const domiciliosFiltrados = pedidos.filter(p => {
    if (filtroEstado === 'activos') return p.estado !== 'entregado' && p.estado !== 'cancelado';
    if (filtroEstado === 'entregados') return p.estado === 'entregado';
    return true;
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">🛵 Panel de Domicilios</h1>
          <p className="page-subtitle">
            {canSeeAll ? 'Gestión global de envíos a domicilio' : 'Mis envíos asignados'}
          </p>
        </div>
      </div>

      {mensaje && (
        <div className={`toast toast--${mensaje.tipo === 'exito' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {mensaje.texto}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`tab-btn ${filtroEstado === 'activos' ? 'active' : ''}`}
          onClick={() => setFiltroEstado('activos')}
        >
          🛵 Activos / En camino ({pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length})
        </button>
        <button
          className={`tab-btn ${filtroEstado === 'entregados' ? 'active' : ''}`}
          onClick={() => setFiltroEstado('entregados')}
        >
          ✅ Entregados hoy
        </button>
        <button
          className={`tab-btn ${filtroEstado === 'todos' ? 'active' : ''}`}
          onClick={() => setFiltroEstado('todos')}
        >
          📁 Todos
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '250px' }} />
      ) : domiciliosFiltrados.length === 0 ? (
        <div className="empty-state">
          <p>No hay pedidos de domicilio en esta sección.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {domiciliosFiltrados.map((p) => {
            const clienteNombre = p.cliente?.nombre || p.cliente_nombre_rapido || 'Cliente';
            const clienteTel = p.cliente?.telefono || p.cliente_telefono_rapido || '';
            const direccion = p.cliente?.direccion || 'Dirección no registrada';
            const barrio = p.cliente?.barrio || '';
            const notasEntrega = p.cliente?.notas_entrega;

            const textWA = `Hola ${clienteNombre}, tu pedido #${p.numero_pedido} de Áarstova está en camino. Total a pagar: $${p.total.toLocaleString('es-CO')}. ¡Gracias! 🛵`;
            const linkWA = `https://wa.me/57${clienteTel.replace(/\D/g, '')}?text=${encodeURIComponent(textWA)}`;
            const linkMap = `https://maps.google.com/?q=${encodeURIComponent(`${direccion}, ${barrio}`)}`;

            return (
              <div
                key={p.id}
                className="nm-card"
                style={{
                  padding: '1.25rem',
                  borderLeft: `5px solid var(--status-${p.estado === 'entregado' ? 'done' : p.estado === 'en_camino' ? 'transit' : 'pending'})`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>#{p.numero_pedido}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span className={`badge badge-${p.estado === 'entregado' ? 'done' : p.estado === 'en_camino' ? 'transit' : 'pending'}`}>
                      {p.estado}
                    </span>
                    <span className={`badge badge-${p.estado_pago === 'pagado' ? 'success' : 'cancel'}`}>
                      {p.estado_pago === 'pagado' ? 'Pagado' : 'Cobrar'}
                    </span>
                  </div>
                </div>

                <div className="nm-inset" style={{ padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '1.05rem', display: 'block' }}>👤 {clienteNombre}</strong>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>📍 {direccion} {barrio ? `(${barrio})` : ''}</p>
                  {clienteTel && <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }} className="text-muted">📞 {clienteTel}</p>}
                </div>

                {notasEntrega && (
                  <div style={{ background: '#fff3cd', border: '1px solid #ffe8a1', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.75rem', color: '#856404' }}>
                    ⚠️ <strong>Nota Entrega:</strong> {notasEntrega}
                  </div>
                )}

                {/* Items del pedido */}
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <strong>Platos:</strong>
                  <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                    {p.detalle?.map((d, i) => (
                      <li key={i}>{d.cantidad}x {d.plato?.nombre}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  <span>Total a cobro:</span>
                  <span style={{ color: 'var(--orange-dark)' }}>${p.total.toLocaleString('es-CO')}</span>
                </div>

                {/* Reasignar Domiciliario (Admin) */}
                {canSeeAll && (
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Domiciliario Asignado</label>
                    <select
                      className="form-select"
                      style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                      value={p.domiciliario_id || ''}
                      onChange={(e) => reasignarDomiciliario(p.id, e.target.value)}
                    >
                      <option value="">-- Sin Asignar --</option>
                      {domiciliarios.map((d) => (
                        <option key={d.id} value={d.id}>{d.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Acciones Rápidas */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {clienteTel && (
                    <a href={linkWA} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-success" style={{ textDecoration: 'none' }}>
                      💬 WhatsApp
                    </a>
                  )}
                  <a href={linkMap} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-neutral" style={{ textDecoration: 'none' }}>
                    🗺️ Mapa
                  </a>

                  {p.estado === 'pendiente' || p.estado === 'listo' ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => actualizarEstadoPedido(p.id, 'en_camino')}
                    >
                      🛵 Salir a Domicilio
                    </button>
                  ) : null}

                  {p.estado === 'en_camino' && (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => actualizarEstadoPedido(p.id, 'entregado', 'pagado')}
                    >
                      ✅ Marcar Entregado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
