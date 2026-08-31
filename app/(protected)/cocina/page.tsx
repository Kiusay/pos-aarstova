'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type {
  Pedido,
  DetallePedido,
  EstadoPedido,
  EstadoItem,
} from '@/lib/types';

// ─── Types ──────────────────────────────────────────────────────────────────

type PedidoKDS = Pedido & {
  detalle: DetallePedido[];
};

type FiltroKDS = 'todos' | 'mesa' | 'domicilio' | 'pendiente' | 'preparacion';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getElapsedSeconds(fechaCreacion: string): number {
  return Math.floor((Date.now() - new Date(fechaCreacion).getTime()) / 1000);
}

function estadoBadgeClass(estado: EstadoPedido): string {
  switch (estado) {
    case 'pendiente':   return 'badge badge-pending';
    case 'preparacion': return 'badge badge-prep';
    case 'listo':       return 'badge badge-ready';
    case 'en_camino':   return 'badge badge-transit';
    case 'entregado':   return 'badge badge-done';
    case 'cancelado':   return 'badge badge-cancel';
    default:            return 'badge';
  }
}

function estadoItemEmoji(estado: EstadoItem): string {
  switch (estado) {
    case 'enviado_cocina':  return '🕐';
    case 'en_preparacion':  return '🔥';
    case 'servido':         return '✅';
    default:                return '🕐';
  }
}

function nextEstadoItem(current: EstadoItem): EstadoItem {
  switch (current) {
    case 'enviado_cocina':  return 'en_preparacion';
    case 'en_preparacion':  return 'servido';
    case 'servido':         return 'enviado_cocina';
    default:                return 'en_preparacion';
  }
}

const ESTADO_ORDEN: Record<EstadoPedido, number> = {
  pendiente:   0,
  preparacion: 1,
  listo:       2,
  en_camino:   3,
  entregado:   4,
  cancelado:   5,
};

// ─── Sound ───────────────────────────────────────────────────────────────────

function playBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext unavailable
  }
}

// ─── OrderTimer ──────────────────────────────────────────────────────────────

interface TimerProps {
  fechaCreacion: string;
  isListo: boolean;
  fechaListo: string | null;
  limiteSeg: number;
}

function OrderTimer({ fechaCreacion, isListo, fechaListo, limiteSeg }: TimerProps) {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (isListo && fechaListo) {
      return Math.floor(
        (new Date(fechaListo).getTime() - new Date(fechaCreacion).getTime()) / 1000
      );
    }
    return getElapsedSeconds(fechaCreacion);
  });

  useEffect(() => {
    if (isListo) return;
    const id = setInterval(() => {
      setElapsed(getElapsedSeconds(fechaCreacion));
    }, 1000);
    return () => clearInterval(id);
  }, [fechaCreacion, isListo]);

  const isOver = elapsed > limiteSeg;

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.82rem',
        fontWeight: 700,
        color: isOver ? 'var(--status-cancel)' : 'var(--text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      {isOver && <span title="Tiempo límite superado">⚠️</span>}
      ⏱ {formatElapsed(elapsed)}
    </span>
  );
}

// ─── ItemRow ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: DetallePedido;
  onCycleEstado: (itemId: string, nuevoEstado: EstadoItem) => Promise<void>;
}

function ItemRow({ item, onCycleEstado }: ItemRowProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    await onCycleEstado(item.id, nextEstadoItem(item.estado_item));
    setLoading(false);
  }

  return (
    <li
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '6px 4px',
        borderRadius: 'var(--border-radius-sm)',
        cursor: loading ? 'wait' : 'pointer',
        opacity: item.estado_item === 'servido' ? 0.55 : 1,
        transition: 'background var(--transition-fast)',
        listStyle: 'none',
      }}
      title="Clic para avanzar estado"
    >
      <span style={{ fontSize: '1rem', lineHeight: 1.4, flexShrink: 0 }}>
        {estadoItemEmoji(item.estado_item)}
      </span>
      <span style={{ flex: 1, fontSize: '0.875rem', lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>×{item.cantidad}</span>{' '}
        {item.plato?.nombre ?? 'Plato'}
        {item.modificaciones && (
          <span
            style={{
              display: 'block',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              marginTop: '2px',
            }}
          >
            {item.modificaciones}
          </span>
        )}
      </span>
    </li>
  );
}

// ─── OrderCard ───────────────────────────────────────────────────────────────

interface OrderCardProps {
  pedido: PedidoKDS;
  limiteSeg: number;
  onUpdateEstado: (pedidoId: string, nuevoEstado: EstadoPedido) => Promise<void>;
  onCycleItemEstado: (itemId: string, nuevoEstado: EstadoItem) => Promise<void>;
}

function OrderCard({ pedido, limiteSeg, onUpdateEstado, onCycleItemEstado }: OrderCardProps) {
  const [loadingBtn, setLoadingBtn] = useState<string | null>(null);

  const identifier =
    pedido.tipo === 'mesa'
      ? `Mesa ${pedido.mesa?.numero ?? pedido.mesa_id?.slice(0, 4)}`
      : pedido.cliente?.nombre ?? pedido.cliente_nombre_rapido ?? 'Cliente';

  const rondas = pedido.detalle.reduce<Record<number, DetallePedido[]>>((acc, item) => {
    (acc[item.ronda] = acc[item.ronda] ?? []).push(item);
    return acc;
  }, {});

  const rondasKeys = Object.keys(rondas)
    .map(Number)
    .sort((a, b) => a - b);

  const maxRonda = rondasKeys[rondasKeys.length - 1] ?? 1;

  async function handleEstado(nuevoEstado: EstadoPedido) {
    setLoadingBtn(nuevoEstado);
    await onUpdateEstado(pedido.id, nuevoEstado);
    setLoadingBtn(null);
  }

  const borderColor =
    pedido.estado === 'pendiente'
      ? 'var(--status-pending)'
      : pedido.estado === 'preparacion'
      ? 'var(--status-prep)'
      : 'var(--status-ready)';

  const isPendiente   = pedido.estado === 'pendiente';
  const isPreparacion = pedido.estado === 'preparacion';
  const isListo       = pedido.estado === 'listo';

  return (
    <article
      className={`nm-card kds-card${isPendiente ? ' kds-card--pulse' : ''}`}
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      {/* Header */}
      <header className="kds-card-header">
        <div className="kds-card-meta">
          <span className="kds-order-num">#{pedido.numero_pedido}</span>
          <span
            className="badge"
            style={{
              background:
                pedido.tipo === 'mesa' ? 'var(--orange-muted)' : '#7C3ABD20',
              color: pedido.tipo === 'mesa' ? 'var(--orange)' : 'var(--status-transit)',
            }}
          >
            {pedido.tipo === 'mesa' ? '🪑 Mesa' : '🛵 Dom.'}
          </span>
          {maxRonda > 1 && (
            <span className="badge badge-orange">Ronda {maxRonda}</span>
          )}
        </div>
        <span className={estadoBadgeClass(pedido.estado)}>
          {pedido.estado === 'pendiente'
            ? 'Pendiente'
            : pedido.estado === 'preparacion'
            ? 'En prep.'
            : 'Listo'}
        </span>
      </header>

      {/* Identifier */}
      <div className="kds-card-identifier">
        <span>{identifier}</span>
        {pedido.notas_generales && (
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}
          >
            📝 {pedido.notas_generales}
          </span>
        )}
      </div>

      {/* Timer */}
      <OrderTimer
        fechaCreacion={pedido.fecha_creacion}
        isListo={isListo || pedido.estado === 'en_camino' || pedido.estado === 'entregado'}
        fechaListo={pedido.fecha_listo}
        limiteSeg={limiteSeg}
      />

      {/* Items */}
      <div className="nm-inset kds-items-area">
        {rondasKeys.map((ronda) => (
          <div key={ronda} className="kds-ronda-group">
            {rondasKeys.length > 1 && (
              <p className="section-title" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>
                Ronda {ronda}
              </p>
            )}
            <ul style={{ margin: 0, padding: 0 }}>
              {rondas[ronda].map((item) => (
                <ItemRow key={item.id} item={item} onCycleEstado={onCycleItemEstado} />
              ))}
            </ul>
          </div>
        ))}
        {pedido.detalle.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: '8px 0' }}>
            Sin ítems
          </p>
        )}
      </div>

      {/* Footer */}
      <footer className="kds-card-footer">
        {isPendiente && (
          <button
            className="btn btn-sm btn-primary btn-full"
            disabled={loadingBtn === 'preparacion'}
            onClick={() => handleEstado('preparacion')}
          >
            {loadingBtn === 'preparacion' ? '…' : '🔥 En preparación'}
          </button>
        )}
        {isPreparacion && (
          <button
            className="btn btn-sm btn-success btn-full"
            disabled={loadingBtn === 'listo'}
            onClick={() => handleEstado('listo')}
          >
            {loadingBtn === 'listo' ? '…' : '✅ Listo'}
          </button>
        )}
        {isListo && (
          pedido.tipo === 'mesa' ? (
            <button
              className="btn btn-sm btn-neutral btn-full"
              disabled={loadingBtn === 'entregado'}
              onClick={() => handleEstado('entregado')}
            >
              {loadingBtn === 'entregado' ? '…' : '🍽️ Entregado'}
            </button>
          ) : (
            <button
              className="btn btn-sm btn-neutral btn-full"
              disabled={loadingBtn === 'en_camino'}
              onClick={() => handleEstado('en_camino')}
            >
              {loadingBtn === 'en_camino' ? '…' : '🛵 En camino'}
            </button>
          )
        )}
      </footer>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CocinaPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [pedidos, setPedidos] = useState<PedidoKDS[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroKDS>('todos');
  const [sonido, setSonido] = useState(false);
  const [limiteSeg, setLimiteSeg] = useState(20 * 60);

  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;

  const lastPendienteCount = useRef(0);

  const fetchPedidos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(
          `*, mesa:mesas(*), cliente:clientes(*), domiciliario:usuarios(*),
           detalle:detalle_pedido(*, plato:platos(*))`
        )
        .in('estado', ['pendiente', 'preparacion', 'listo'])
        .order('fecha_creacion', { ascending: true });

      if (error) {
        console.error('[KDS] fetchPedidos error:', error);
      } else {
        const sorted = ((data as PedidoKDS[]) ?? []).sort(
          (a, b) => ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado]
        );

        const pendienteNow = sorted.filter((p) => p.estado === 'pendiente').length;
        if (sonidoRef.current && pendienteNow > lastPendienteCount.current) {
          playBeep();
        }
        lastPendienteCount.current = pendienteNow;

        setPedidos(sorted);
      }
    } catch (err) {
      console.error('[KDS] catch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Load config
  useEffect(() => {
    supabase
      .from('restaurante_config')
      .select('tiempo_limite_cocina_min')
      .single()
      .then(({ data }) => {
        if (data?.tiempo_limite_cocina_min) {
          setLimiteSeg(data.tiempo_limite_cocina_min * 60);
        }
      });
  }, [supabase]);

  // Initial fetch + 30s fallback
  useEffect(() => {
    fetchPedidos();
    const iv = setInterval(fetchPedidos, 30_000);
    return () => clearInterval(iv);
  }, [fetchPedidos]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('kds-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, fetchPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_pedido' }, fetchPedidos)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchPedidos]);

  async function handleUpdateEstado(pedidoId: string, nuevoEstado: EstadoPedido): Promise<void> {
    const updates: Record<string, unknown> = { estado: nuevoEstado };
    if (nuevoEstado === 'listo')    updates.fecha_listo = new Date().toISOString();
    if (nuevoEstado === 'entregado') updates.fecha_entregado = new Date().toISOString();

    const { error } = await supabase.from('pedidos').update(updates).eq('id', pedidoId);
    if (error) console.error('[KDS] update pedido error:', error);
    fetchPedidos();
  }

  async function handleCycleItemEstado(itemId: string, nuevoEstado: EstadoItem): Promise<void> {
    const { error } = await supabase
      .from('detalle_pedido')
      .update({ estado_item: nuevoEstado })
      .eq('id', itemId);
    if (error) console.error('[KDS] update item error:', error);

    // Optimistic update
    setPedidos((prev) =>
      prev.map((p) => ({
        ...p,
        detalle: p.detalle.map((d) =>
          d.id === itemId ? { ...d, estado_item: nuevoEstado } : d
        ),
      }))
    );
  }

  // Permission check
  if (sesion !== null && !sesion.permisos.kds_ver) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <span className="empty-state__icon">🔒</span>
          <p className="empty-state__title">Acceso denegado</p>
          <p className="empty-state__desc">No tienes permiso para ver la pantalla de cocina.</p>
        </div>
      </main>
    );
  }

  // Filter
  const pedidosFiltrados = pedidos.filter((p) => {
    switch (filtro) {
      case 'mesa':        return p.tipo === 'mesa';
      case 'domicilio':   return p.tipo === 'domicilio';
      case 'pendiente':   return p.estado === 'pendiente';
      case 'preparacion': return p.estado === 'preparacion';
      default:            return true;
    }
  });

  const counts = {
    todos:       pedidos.length,
    mesa:        pedidos.filter((p) => p.tipo === 'mesa').length,
    domicilio:   pedidos.filter((p) => p.tipo === 'domicilio').length,
    pendiente:   pedidos.filter((p) => p.estado === 'pendiente').length,
    preparacion: pedidos.filter((p) => p.estado === 'preparacion').length,
  };

  return (
    <>
      <style>{`
        .kds-topbar {
          position: sticky;
          top: var(--navbar-height);
          z-index: 40;
          background: var(--bg-base);
          padding: var(--space-3) var(--space-4);
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-wrap: wrap;
        }
        .kds-filter-bar {
          display: flex;
          gap: var(--space-1);
          background: var(--bg-base);
          border-radius: var(--border-radius-lg);
          box-shadow: var(--shadow-inset);
          padding: 4px;
          overflow-x: auto;
          flex: 1;
          min-width: 0;
        }
        .kds-filter-btn {
          flex-shrink: 0;
          padding: var(--space-2) var(--space-3);
          border: none;
          border-radius: var(--border-radius-md);
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-weight: 600;
          font-family: var(--font-ui);
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .kds-filter-btn.active {
          background: var(--bg-raised);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .kds-filter-btn:hover:not(.active) { color: var(--text-primary); }
        .kds-count {
          background: var(--orange-muted);
          color: var(--orange);
          border-radius: var(--border-radius-full);
          font-size: 0.68rem;
          font-weight: 800;
          padding: 1px 6px;
          min-width: 18px;
          text-align: center;
          line-height: 1.6;
        }
        .kds-sound-label {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .kds-grid-wrap {
          overflow-x: auto;
          padding: var(--space-4);
          min-height: 60vh;
        }
        .kds-grid {
          display: flex;
          gap: var(--space-4);
          min-width: max-content;
          align-items: flex-start;
        }
        .kds-card {
          width: 300px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        @keyframes kds-pulse-border {
          0%, 100% { box-shadow: var(--shadow-md); }
          50%       { box-shadow: var(--shadow-md), 0 0 0 3px var(--status-pending); }
        }
        .kds-card--pulse { animation: kds-pulse-border 2s ease-in-out infinite; }
        .kds-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .kds-card-meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .kds-order-num {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .kds-card-identifier {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .kds-items-area { flex: 1; min-height: 60px; }
        .kds-ronda-group + .kds-ronda-group {
          margin-top: var(--space-3);
          padding-top: var(--space-3);
          border-top: 1px solid var(--border);
        }
        .kds-card-footer { display: flex; flex-direction: column; gap: var(--space-2); }
        @media (max-width: 600px) {
          .kds-grid { flex-direction: column; min-width: unset; }
          .kds-card { width: 100%; }
          .kds-grid-wrap { overflow-x: unset; }
        }
      `}</style>

      <main className="main-content" style={{ paddingTop: 'calc(var(--navbar-height) + var(--space-2))' }}>
        {/* Page header */}
        <div className="page-header" style={{ padding: '0 var(--space-4)', paddingTop: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
          <div className="page-title">
            <h1>🍳 Cocina — KDS</h1>
            <span className="page-subtitle">
              {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''} activo{pedidosFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Filter / Sound bar */}
        <div className="kds-topbar">
          <div className="kds-filter-bar">
            {(
              [
                { key: 'todos',       label: 'Todos' },
                { key: 'mesa',        label: '🪑 Mesa' },
                { key: 'domicilio',   label: '🛵 Domicilio' },
                { key: 'pendiente',   label: '⏳ Pendiente' },
                { key: 'preparacion', label: '🔥 En prep.' },
              ] as { key: FiltroKDS; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                className={`kds-filter-btn${filtro === key ? ' active' : ''}`}
                onClick={() => setFiltro(key)}
              >
                {label}
                <span className="kds-count">{counts[key]}</span>
              </button>
            ))}
          </div>

          <label className="nm-checkbox kds-sound-label">
            <input
              type="checkbox"
              checked={sonido}
              onChange={(e) => setSonido(e.target.checked)}
            />
            <span className="nm-checkbox-box" />
            🔔 Sonido
          </label>
        </div>

        {/* Content */}
        {loading ? (
          <div className="kds-grid-wrap">
            <div className="kds-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="nm-card kds-card">
                  <div className="skeleton" style={{ height: '22px', borderRadius: '6px' }} />
                  <div className="skeleton" style={{ height: '16px', borderRadius: '6px', width: '60%' }} />
                  <div className="nm-inset kds-items-area">
                    <div className="skeleton" style={{ height: '14px', borderRadius: '6px', marginBottom: '8px' }} />
                    <div className="skeleton" style={{ height: '14px', borderRadius: '6px', width: '80%' }} />
                  </div>
                  <div className="skeleton" style={{ height: '36px', borderRadius: '8px' }} />
                </div>
              ))}
            </div>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">🎉</span>
            <p className="empty-state__title">Sin pedidos activos</p>
            <p className="empty-state__desc">
              {filtro === 'todos'
                ? 'No hay pedidos pendientes ni en preparación.'
                : `No hay pedidos con filtro "${filtro}".`}
            </p>
          </div>
        ) : (
          <div className="kds-grid-wrap">
            <div className="kds-grid">
              {pedidosFiltrados.map((pedido) => (
                <OrderCard
                  key={pedido.id}
                  pedido={pedido}
                  limiteSeg={limiteSeg}
                  onUpdateEstado={handleUpdateEstado}
                  onCycleItemEstado={handleCycleItemEstado}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
