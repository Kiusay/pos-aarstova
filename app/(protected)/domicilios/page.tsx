'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { Pedido, Usuario } from '@/lib/types';

type TipoPagoDomicilio = 'prepagado' | 'efectivo' | 'transferencia' | 'fiado';

export default function DomiciliosPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('activos');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  // Modal para confirmar entrega y cobro
  const [modalEntrega, setModalEntrega] = useState<Pedido | null>(null);
  const [tipoPago, setTipoPago] = useState<TipoPagoDomicilio>('efectivo');
  const [notaTransferencia, setNotaTransferencia] = useState('');
  const [saving, setSaving] = useState(false);

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
    try {
      const res = await fetch('/api/usuarios/equipo');
      const apiData = await res.json();
      if (apiData?.usuarios) setDomiciliarios(apiData.usuarios as Usuario[]);
    } catch (e) {
      console.warn('Error fetching equipo for domicilios:', e);
    }
  };

  const cargarDomicilios = async () => {
    setLoading(true);
    let query = supabase
      .from('pedidos')
      .select('*, cliente:clientes(*), domiciliario:usuarios!domiciliario_id(*), detalle:detalle_pedido(*, plato:platos(*))')
      .eq('tipo', 'domicilio')
      .order('fecha_creacion', { ascending: false });

    if (!canSeeAll && canSeeOwn && sesion?.usuario?.id) {
      // Mostrar domicilios asignados al usuario O los que aún están sin asignar (libres para tomar)
      query = query.or(`domiciliario_id.eq.${sesion.usuario.id},domiciliario_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else if (data) {
      setPedidos(data as Pedido[]);
    }
    setLoading(false);
  };

  // Tomar un domicilio sin asignar (Auto-asignarse)
  const handleTomarDomicilio = async (pedido: Pedido) => {
    if (!sesion?.usuario?.id) return;
    setSaving(true);
    const auditoriaStr = `[Tomado por ${sesion.usuario.nombre} (${sesion.usuario.rol.toUpperCase()}) a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}]`;
    const updatedNotas = pedido.notas_generales ? `${pedido.notas_generales} ${auditoriaStr}` : auditoriaStr;

    const updatePayload: Record<string, any> = {
      domiciliario_id: sesion.usuario.id,
      notas_generales: updatedNotas
    };

    if (pedido.estado === 'listo') {
      updatePayload.estado = 'en_camino';
    }

    const { error } = await supabase
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedido.id);

    setSaving(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al tomar el domicilio: ' + error.message });
    } else {
      setMensaje({
        tipo: 'exito',
        texto: `🛵 Pedido #${pedido.numero_pedido} asignado a ti correctamente.${pedido.estado === 'listo' ? ' ¡En camino!' : ''}`
      });
      cargarDomicilios();
    }
  };

  // Iniciar recorrido sólo si está listo en cocina
  const handleIniciarRecorrido = async (pedido: Pedido) => {
    if (pedido.estado !== 'listo') {
      setMensaje({ tipo: 'error', texto: '⚠️ El pedido aún no ha sido marcado como LISTO en cocina.' });
      return;
    }

    setSaving(true);
    const auditoriaStr = `[Iniciado recorrido por ${sesion?.usuario?.nombre || 'Repartidor'} a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}]`;
    const updatedNotas = pedido.notas_generales ? `${pedido.notas_generales} ${auditoriaStr}` : auditoriaStr;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'en_camino', notas_generales: updatedNotas })
      .eq('id', pedido.id);

    setSaving(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al iniciar recorrido: ' + error.message });
    } else {
      setMensaje({ tipo: 'exito', texto: `🛵 Pedido #${pedido.numero_pedido} en camino.` });
      cargarDomicilios();
    }
  };

  // Abrir modal para finalizar entrega
  const handleOpenEntregaModal = (pedido: Pedido) => {
    setModalEntrega(pedido);
    if (pedido.estado_pago === 'pagado') {
      setTipoPago('prepagado');
    } else {
      setTipoPago('efectivo');
    }
    setNotaTransferencia(pedido.cuenta_destino || '');
  };

  // Confirmar entrega y cobro
  const handleConfirmarEntrega = async () => {
    if (!modalEntrega) return;
    setSaving(true);

    try {
      const isPagado = tipoPago !== 'fiado';
      const auditoriaStr = `[Entregado y cobrado por: ${sesion?.usuario?.nombre || 'Usuario'} (${sesion?.usuario?.rol?.toUpperCase() || ''}) a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}]`;
      const updatedNotas = modalEntrega.notas_generales ? `${modalEntrega.notas_generales} ${auditoriaStr}` : auditoriaStr;

      const payload: Record<string, any> = {
        estado: 'entregado',
        fecha_entregado: new Date().toISOString(),
        estado_pago: isPagado ? 'pagado' : 'fiado',
        monto_efectivo: isPagado && tipoPago === 'efectivo' ? modalEntrega.total : 0,
        monto_transferencia: isPagado && (tipoPago === 'transferencia' || tipoPago === 'prepagado') ? modalEntrega.total : 0,
        cuenta_destino: isPagado && (tipoPago === 'transferencia' || tipoPago === 'prepagado') ? (notaTransferencia.trim() || null) : null,
        notas_generales: updatedNotas
      };

      let { error } = await supabase.from('pedidos').update(payload).eq('id', modalEntrega.id);

      // Fallback si la columna cuenta_destino tuviera inconsistencia en schema cache
      if (error && error.message?.includes('cuenta_destino')) {
        delete payload.cuenta_destino;
        const retry = await supabase.from('pedidos').update(payload).eq('id', modalEntrega.id);
        error = retry.error;
      }

      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al finalizar entrega: ' + error.message });
      } else {
        setMensaje({ tipo: 'exito', texto: `✅ Domicilio #${modalEntrega.numero_pedido} marcado como ENTREGADO (${isPagado ? 'PAGADO' : 'FIADO'})` });
        setModalEntrega(null);
        cargarDomicilios();
      }
    } catch (err: any) {
      setMensaje({ tipo: 'error', texto: 'Error inesperado: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const reasignarDomiciliario = async (pedido: Pedido, domId: string) => {
    const domObj = domiciliarios.find((d) => d.id === domId);
    const auditoriaStr = domId
      ? `[Asignado a ${domObj?.nombre || 'Repartidor'} por ${sesion?.usuario?.nombre || 'Usuario'} (${sesion?.usuario?.rol?.toUpperCase() || ''})]`
      : `[Liberado por ${sesion?.usuario?.nombre || 'Usuario'}]`;
    const updatedNotas = pedido.notas_generales ? `${pedido.notas_generales} ${auditoriaStr}` : auditoriaStr;

    const { error } = await supabase
      .from('pedidos')
      .update({ domiciliario_id: domId || null, notas_generales: updatedNotas })
      .eq('id', pedido.id);

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

  const domiciliosFiltrados = pedidos.filter((p) => {
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
          🛵 Activos / En camino ({pedidos.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado').length})
        </button>
        <button
          className={`tab-btn ${filtroEstado === 'entregados' ? 'active' : ''}`}
          onClick={() => setFiltroEstado('entregados')}
        >
          ✅ Entregados hoy ({pedidos.filter((p) => p.estado === 'entregado').length})
        </button>
        <button
          className={`tab-btn ${filtroEstado === 'todos' ? 'active' : ''}`}
          onClick={() => setFiltroEstado('todos')}
        >
          📁 Todos ({pedidos.length})
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
            const clienteNombre = p.cliente?.nombre || p.cliente_nombre_rapido || 'Cliente Domicilio';
            const clienteTel = p.cliente?.telefono || p.cliente_telefono_rapido || '';
            const direccion = p.cliente?.direccion || p.notas_generales || 'Dirección no registrada';
            const barrio = p.cliente?.barrio || '';
            const notasEntrega = p.cliente?.notas_entrega;

            const textWA = `Hola ${clienteNombre}, tu pedido #${p.numero_pedido} de Áarstova está en camino. Total a pagar: $${p.total.toLocaleString('es-CO')}. ¡Gracias! 🛵`;
            const linkWA = `https://wa.me/57${clienteTel.replace(/\D/g, '')}?text=${encodeURIComponent(textWA)}`;
            const linkMap = `https://maps.google.com/?q=${encodeURIComponent(`${direccion}, ${barrio}`)}`;

            const isListo = p.estado === 'listo';
            const isEnCamino = p.estado === 'en_camino';
            const isEntregado = p.estado === 'entregado';

            return (
              <div
                key={p.id}
                className="nm-card"
                style={{
                  padding: '1.25rem',
                  borderLeft: `5px solid var(--status-${isEntregado ? 'done' : isEnCamino ? 'transit' : isListo ? 'ready' : 'pending'})`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>#{p.numero_pedido}</span>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span className={`badge badge-${isEntregado ? 'done' : isEnCamino ? 'transit' : isListo ? 'ready' : 'prep'}`}>
                      {isListo ? '✅ LISTO' : isEnCamino ? '🛵 En camino' : isEntregado ? '🏁 Entregado' : '🔥 En Cocina'}
                    </span>
                    {!p.domiciliario_id ? (
                      <span className="badge badge-cancel" style={{ background: '#FFF3CD', color: '#856404' }}>
                        ⚠️ Sin Repartidor
                      </span>
                    ) : p.domiciliario_id === sesion?.usuario?.id ? (
                      <span className="badge badge-success">👤 Tu Domicilio</span>
                    ) : (
                      <span className="badge badge-neutral">🛵 {p.domiciliario?.nombre || 'Personal'}</span>
                    )}
                  </div>
                </div>

                <div className="nm-inset" style={{ padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '1.05rem', display: 'block' }}>👤 {clienteNombre}</strong>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                    📍 <strong>Dirección:</strong> {direccion} {barrio ? ` — 🏘️ Barrio: ${barrio}` : ''}
                  </p>
                  {clienteTel && <p style={{ margin: '0.25rem 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--orange-dark)' }}>📞 {clienteTel}</p>}
                </div>

                {(notasEntrega || (p.notas_generales && p.notas_generales !== direccion)) && (
                  <div style={{ background: '#FFF3CD', borderLeft: '4px solid #FFC107', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.75rem', color: '#856404' }}>
                    ⚠️ <strong>Indicaciones Domicilio:</strong> {notasEntrega || p.notas_generales}
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

                {/* Asignación de Repartidor */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Asignación de Repartidor / Encargado</label>
                  <select
                    className="form-select"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                    value={p.domiciliario_id || ''}
                    onChange={(e) => reasignarDomiciliario(p, e.target.value)}
                  >
                    <option value="">-- Sin Asignar (Disponible para tomar) --</option>
                    {domiciliarios.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} ({d.rol.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Acciones Rápidas */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Botón Tomar Domicilio (si no está asignado) */}
                  {!p.domiciliario_id && !isEntregado && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleTomarDomicilio(p)}
                      disabled={saving}
                      style={{ fontWeight: 800 }}
                    >
                      🛵 Tomar este Domicilio
                    </button>
                  )}

                  {clienteTel && (
                    <a href={linkWA} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-success" style={{ textDecoration: 'none' }}>
                      💬 WhatsApp
                    </a>
                  )}
                  <a href={linkMap} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-neutral" style={{ textDecoration: 'none' }}>
                    🗺️ Mapa
                  </a>

                  {/* 1. Iniciar recorrido cuando cocina lo marque como LISTO */}
                  {p.domiciliario_id && !isEnCamino && !isEntregado && (
                    isListo ? (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleIniciarRecorrido(p)}
                        disabled={saving}
                      >
                        🛵 Iniciar Recorrido
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-neutral"
                        disabled
                        style={{ opacity: 0.65, cursor: 'not-allowed' }}
                        title="Esperando que la cocina marque como listo"
                      >
                        ⏳ En Cocina (No listo)
                      </button>
                    )
                  )}

                  {/* 2. Confirmar entrega con Modal de Cobro */}
                  {p.domiciliario_id && (isEnCamino || isListo) && (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleOpenEntregaModal(p)}
                      disabled={saving}
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

      {/* Modal para Confirmar Entrega y Medio de Pago */}
      {modalEntrega && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalEntrega(null)}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal__header">
              <h3>🛵 Finalizar Entrega — Pedido #{modalEntrega.numero_pedido}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalEntrega(null)}>✕</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', padding: 'var(--space-3)', borderRadius: 'var(--border-radius-md)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Monto a Cobrar:</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--orange-dark)' }}>
                  ${modalEntrega.total.toLocaleString('es-CO')}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '4px' }}>
                  👤 {modalEntrega.cliente?.nombre || modalEntrega.cliente_nombre_rapido || 'Cliente Domicilio'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">¿Cómo se realizó el pago?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="tipoPagoDom"
                      checked={tipoPago === 'prepagado'}
                      onChange={() => setTipoPago('prepagado')}
                    />
                    <span>✅ Ya estaba pagado previamente (online / Nequi previo)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="tipoPagoDom"
                      checked={tipoPago === 'efectivo'}
                      onChange={() => setTipoPago('efectivo')}
                    />
                    <span>💵 Cobrado en efectivo al entregar</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="tipoPagoDom"
                      checked={tipoPago === 'transferencia'}
                      onChange={() => setTipoPago('transferencia')}
                    />
                    <span>📲 Cobrado por transferencia al entregar</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="tipoPagoDom"
                      checked={tipoPago === 'fiado'}
                      onChange={() => setTipoPago('fiado')}
                    />
                    <span>⏳ Quedó debiendo / Fiado</span>
                  </label>
                </div>
              </div>

              {(tipoPago === 'transferencia' || tipoPago === 'prepagado') && (
                <div className="form-group">
                  <label className="form-label">Banco / Nota de Transferencia (Opcional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={notaTransferencia}
                    onChange={(e) => setNotaTransferencia(e.target.value)}
                    placeholder="Ej: Nequi, Bancolombia, Daviplata, etc."
                  />
                </div>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalEntrega(null)}>Cancelar</button>
              <button className="btn btn-success" onClick={handleConfirmarEntrega} disabled={saving}>
                {saving ? 'Guardando…' : '✅ Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
