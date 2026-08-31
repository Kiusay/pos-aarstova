'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type { Pedido, DetallePedido, EstadoPago } from '@/lib/types';

type PedidoMesero = Pedido & {
  detalle: DetallePedido[];
};

type FiltroMesero = 'todos' | 'listo' | 'preparacion' | 'entregado';

export default function MeseroPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<PedidoMesero[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroMesero>('todos');
  const [selectedPedido, setSelectedPedido] = useState<PedidoMesero | null>(null);
  const [modalCobro, setModalCobro] = useState<PedidoMesero | null>(null);
  const [mensajeToast, setMensajeToast] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);

  // Formulario de cobro
  const [estadoPagoCobro, setEstadoPagoCobro] = useState<EstadoPago>('pagado');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'mixto'>('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [cuentaDestino, setCuentaDestino] = useState('');
  const [liberarMesa, setLiberarMesa] = useState(true);
  const [saving, setSaving] = useState(false);

  function toast(texto: string, tipo: 'exito' | 'error' | 'info' = 'info') {
    setMensajeToast({ tipo, texto });
    setTimeout(() => setMensajeToast(null), 4000);
  }

  const cargarPedidos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`*, mesa:mesas!mesa_id(*), cliente:clientes(*), detalle:detalle_pedido(*, plato:platos(*))`)
        .eq('tipo', 'mesa')
        .not('estado', 'eq', 'cancelado')
        .order('fecha_creacion', { ascending: false });

      if (error) {
        console.error('[Mesero] fetch error:', error);
      } else if (data) {
        setPedidos(data as PedidoMesero[]);
      }
    } catch (err) {
      console.error('[Mesero] catch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    cargarPedidos();

    const channel = supabase
      .channel('mesero-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargarPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_pedido' }, cargarPedidos)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cargarPedidos, supabase]);

  // Marcar entregado a mesa
  const handleEntregarAMesa = async (pedido: PedidoMesero) => {
    setSaving(true);
    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: 'entregado',
        fecha_entregado: new Date().toISOString(),
      })
      .eq('id', pedido.id);

    setSaving(false);

    if (error) {
      toast('Error al actualizar estado: ' + error.message, 'error');
    } else {
      toast(`🍽️ Pedido #${pedido.numero_pedido} entregado a la Mesa ${pedido.mesa?.numero || ''}`, 'exito');
      cargarPedidos();
    }
  };

  // Abrir modal de cobro
  const handleOpenCobro = (pedido: PedidoMesero) => {
    setSelectedPedido(null);
    setModalCobro(pedido);
    setMontoEfectivo(pedido.total);
    setMontoTransferencia(0);
    setEstadoPagoCobro('pagado');
  };

  // Confirmar cobro y cierre
  const handleConfirmarCobro = async () => {
    if (!modalCobro) return;
    setSaving(true);

    try {
      const updates: any = {
        estado_pago: estadoPagoCobro,
        estado: 'entregado',
        fecha_entregado: new Date().toISOString(),
      };

      if (estadoPagoCobro === 'pagado') {
        updates.monto_efectivo = metodoPago === 'efectivo' || metodoPago === 'mixto' ? montoEfectivo : 0;
        updates.monto_transferencia = metodoPago === 'transferencia' || metodoPago === 'mixto' ? montoTransferencia : 0;
        updates.cuenta_destino = cuentaDestino || null;
      }

      const { error: errPed } = await supabase
        .from('pedidos')
        .update(updates)
        .eq('id', modalCobro.id);

      if (errPed) throw errPed;

      // Liberar mesa si se indicó
      if (liberarMesa && modalCobro.mesa_id) {
        await supabase.from('mesas').update({ estado: 'libre' }).eq('id', modalCobro.mesa_id);
      }

      toast(`✅ Pedido #${modalCobro.numero_pedido} cerrado correctamente (${estadoPagoCobro.toUpperCase()})`, 'exito');
      setModalCobro(null);
      cargarPedidos();
    } catch (err: any) {
      toast('Error al procesar cobro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const pedidosFiltrados = pedidos.filter((p) => {
    if (filtro === 'listo') return p.estado === 'listo';
    if (filtro === 'preparacion') return p.estado === 'preparacion' || p.estado === 'pendiente';
    if (filtro === 'entregado') return p.estado === 'entregado';
    return true;
  });

  const listosCount = pedidos.filter((p) => p.estado === 'listo').length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-4)' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="page-title">
          <h1>🪑 Atención de Meseros</h1>
          <span className="page-subtitle">Entrega de platos a mesas, comandas y cobro final</span>
        </div>
      </div>

      {mensajeToast && (
        <div className={`toast toast--${mensajeToast.tipo === 'exito' ? 'success' : mensajeToast.tipo === 'error' ? 'error' : 'default'}`} style={{ marginBottom: '1rem' }}>
          {mensajeToast.texto}
        </div>
      )}

      {/* Alerta de Platos Listos en Cocina */}
      {listosCount > 0 && (
        <div className="nm-card" style={{ background: 'var(--green-muted)', borderLeft: '5px solid var(--green)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, color: 'var(--green-dark)', fontSize: '1rem' }}>
              🔔 ¡Atención! Hay {listosCount} pedido{listosCount !== 1 ? 's' : ''} LISTO{listosCount !== 1 ? 'S' : ''} en cocina para servir a mesa!
            </span>
            <button className="btn btn-sm btn-success" onClick={() => setFiltro('listo')}>
              👁️ Ver Listos
            </button>
          </div>
        </div>
      )}

      {/* Bar de Filtros */}
      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        {(
          [
            { key: 'todos', label: 'Todos los Pedidos' },
            { key: 'listo', label: `✅ Listos (${listosCount})` },
            { key: 'preparacion', label: '🔥 En Cocina' },
            { key: 'entregado', label: '🍽️ Entregados' },
          ] as { key: FiltroMesero; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            className={`tab-btn ${filtro === key ? 'active' : ''}`}
            onClick={() => setFiltro(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid de Pedidos */}
      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          ⏳ Cargando comandas de mesero…
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">🪑</span>
          <p className="empty-state__title">Sin comandas en este filtro</p>
          <p className="empty-state__desc">Usa el botón "➕ Nuevo Pedido" para abrir comandas en mesa.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {pedidosFiltrados.map((pedido) => {
            const isListo = pedido.estado === 'listo';
            const isEntregado = pedido.estado === 'entregado';
            const isPagado = pedido.estado_pago === 'pagado';
            const itemsCount = (pedido.detalle || []).reduce((acc, i) => acc + i.cantidad, 0);

            return (
              <div
                key={pedido.id}
                className="nm-card"
                style={{
                  borderTop: `4px solid ${
                    isListo
                      ? 'var(--status-ready)'
                      : isEntregado
                      ? 'var(--status-done)'
                      : 'var(--status-prep)'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {/* Header card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
                    #{pedido.numero_pedido}
                  </span>
                  <span
                    className={`badge badge-${
                      isListo ? 'ready' : isEntregado ? 'done' : 'prep'
                    }`}
                  >
                    {isListo ? '✅ LISTO PARA SERVIR' : isEntregado ? '🍽️ Entregado' : '🔥 En Cocina'}
                  </span>
                </div>

                {/* Info Mesa */}
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  🪑 Mesa {pedido.mesa?.numero || 'N/A'} {pedido.mesa?.nombre ? `(${pedido.mesa.nombre})` : ''}
                </div>

                {/* Items resumen */}
                <div className="nm-inset" style={{ padding: 'var(--space-3)', borderRadius: 'var(--border-radius-md)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {itemsCount} ítem{itemsCount !== 1 ? 's' : ''} en comanda:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                    {(pedido.detalle || []).map((item) => (
                      <li key={item.id} style={{ marginBottom: '2px' }}>
                        <strong>×{item.cantidad}</strong> {item.plato?.nombre || 'Plato'}
                        {item.modificaciones && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            ({item.modificaciones})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Estado de Pago */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span className="text-muted">Estado pago:</span>
                  <span className={`badge badge-${isPagado ? 'success' : pedido.estado_pago === 'fiado' ? 'warning' : 'cancel'}`}>
                    {pedido.estado_pago.toUpperCase()}
                  </span>
                </div>

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--orange-dark)' }}>
                    ${pedido.total.toLocaleString('es-CO')}
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(pedido)}>
                    👁️ Ver Detalle
                  </button>
                </div>

                {/* Botones de acción del mesero */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {isListo && (
                    <button
                      className="btn btn-success btn-full"
                      onClick={() => handleEntregarAMesa(pedido)}
                      disabled={saving}
                    >
                      🍽️ Marcar Entregado a Mesa
                    </button>
                  )}

                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => handleOpenCobro(pedido)}
                    disabled={saving}
                  >
                    💰 Finalizar & Cobrar Mesa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DETALLE PEDIDO */}
      {selectedPedido && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedPedido(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal__header">
              <h3>Pedido #{selectedPedido.numero_pedido} — Mesa {selectedPedido.mesa?.numero || ''}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(null)}>✕</button>
            </div>
            <div className="modal__body">
              <p><strong>Estado comanda:</strong> {selectedPedido.estado.toUpperCase()}</p>
              <p><strong>Estado pago:</strong> {selectedPedido.estado_pago.toUpperCase()}</p>
              <p><strong>Hora pedido:</strong> {new Date(selectedPedido.fecha_creacion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <hr style={{ margin: '0.5rem 0', borderColor: 'var(--border)' }} />
              <h4>Platos pedidos:</h4>
              {(selectedPedido.detalle || []).map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem' }}>
                  <span>×{d.cantidad} {d.plato?.nombre} {d.modificaciones ? `(${d.modificaciones})` : ''}</span>
                  <span>${d.subtotal.toLocaleString('es-CO')}</span>
                </div>
              ))}
              <hr style={{ margin: '0.5rem 0', borderColor: 'var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--orange-dark)' }}>
                <span>Total:</span>
                <span>${selectedPedido.total.toLocaleString('es-CO')}</span>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setSelectedPedido(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => handleOpenCobro(selectedPedido)}>💰 Cobrar Mesa</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COBRO Y CIERRE DE MESA */}
      {modalCobro && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalCobro(null)}>
          <div className="modal" style={{ maxWidth: '460px' }}>
            <div className="modal__header">
              <h3>💰 Cierre y Cobro — Mesa {modalCobro.mesa?.numero || ''}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalCobro(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', margin: 'var(--space-3) 0' }}>
              <div style={{ textAlign: 'center', padding: 'var(--space-3)', background: 'var(--bg-inset)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Monto a cobrar:</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--orange-dark)' }}>
                  ${modalCobro.total.toLocaleString('es-CO')}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Opción de Cierre de Pedido *</label>
                <select
                  className="form-select"
                  value={estadoPagoCobro}
                  onChange={(e) => setEstadoPagoCobro(e.target.value as EstadoPago)}
                >
                  <option value="pagado">💵 Entregado y PAGADO AHORA</option>
                  <option value="fiado">📝 Entregado y FIADO</option>
                  <option value="pendiente_pago">⏳ Entregado (Pendiente de pago)</option>
                </select>
              </div>

              {estadoPagoCobro === 'pagado' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Método de Pago</label>
                    <select
                      className="form-select"
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value as any)}
                    >
                      <option value="efectivo">💵 Efectivo</option>
                      <option value="transferencia">📱 Transferencia (Nequi / Daviplata / Banco)</option>
                      <option value="mixto">🔄 Pago Mixto</option>
                    </select>
                  </div>

                  {(metodoPago === 'transferencia' || metodoPago === 'mixto') && (
                    <div className="form-group">
                      <label className="form-label">Cuenta Destino</label>
                      <input
                        type="text"
                        className="form-input"
                        value={cuentaDestino}
                        onChange={(e) => setCuentaDestino(e.target.value)}
                        placeholder="Ej: Nequi 3001234567"
                      />
                    </div>
                  )}
                </>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={liberarMesa}
                  onChange={(e) => setLiberarMesa(e.target.checked)}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>🔓 Liberar Mesa tras el cobro</span>
              </label>
            </div>

            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalCobro(null)}>Cancelar</button>
              <button className="btn btn-success" onClick={handleConfirmarCobro} disabled={saving}>
                {saving ? 'Procesando...' : '✅ Confirmar y Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
