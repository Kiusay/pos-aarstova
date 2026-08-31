'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type { TurnoCaja } from '@/lib/types';

interface MetricasJornada {
  pedidosActivos: number;
  mesasOcupadas: number;
  domiciliosEnRuta: number;
  ventasHoy: number;
  turnoAbierto: TurnoCaja | null;
}

function formatCOP(valor: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(valor);
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fraseAleatoria(): { frase: string; autor: string } {
  // Fallback mientras no hay mensaje_dia cargado
  return {
    frase: 'Cada gran restaurante empieza con una gran cocina y un gran equipo.',
    autor: 'Áarstova',
  };
}

export default function DashboardPage() {
  const sesion = useSesion();
  const supabase = createClient();
  const [metricas, setMetricas] = useState<MetricasJornada>({
    pedidosActivos: 0,
    mesasOcupadas: 0,
    domiciliosEnRuta: 0,
    ventasHoy: 0,
    turnoAbierto: null,
  });
  const [mensajeDia, setMensajeDia] = useState<{ frase: string; autor: string }>(fraseAleatoria());
  const [cargando, setCargando] = useState(true);
  const [horaActual, setHoraActual] = useState('');

  const cargarDatos = useCallback(async () => {
    const hoy = new Date().toISOString().split('T')[0];

    const [
      { data: pedidosActivos },
      { data: mesasOcupadas },
      { data: turnoAbierto },
      { data: mensajeDiaDB },
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id, total', { count: 'exact' })
        .not('estado', 'in', '(entregado,cancelado)'),
      supabase
        .from('mesas')
        .select('id', { count: 'exact' })
        .eq('estado', 'ocupada'),
      supabase
        .from('turnos_caja')
        .select('*')
        .eq('estado', 'abierto')
        .maybeSingle(),
      supabase
        .from('mensaje_dia')
        .select('frase, autor_frase')
        .eq('fecha', hoy)
        .maybeSingle(),
    ]);

    // Ventas del día (pedidos entregados hoy)
    const { data: ventasHoy } = await supabase
      .from('pedidos')
      .select('total')
      .eq('estado', 'entregado')
      .gte('fecha_creacion', `${hoy}T00:00:00`)
      .lte('fecha_creacion', `${hoy}T23:59:59`);

    const totalVentas = (ventasHoy || []).reduce((acc, p) => acc + (p.total || 0), 0);
    const domiciliosEnRuta = (pedidosActivos || []).filter((p: any) => p.tipo === 'en_camino').length;

    setMetricas({
      pedidosActivos: pedidosActivos?.length || 0,
      mesasOcupadas: mesasOcupadas?.length || 0,
      domiciliosEnRuta,
      ventasHoy: totalVentas,
      turnoAbierto: turnoAbierto || null,
    });

    if (mensajeDiaDB?.frase) {
      setMensajeDia({ frase: mensajeDiaDB.frase, autor: mensajeDiaDB.autor_frase || 'Chef' });
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    cargarDatos();

    // Actualizar hora cada minuto
    const tick = () => setHoraActual(
      new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
    );
    tick();
    const intervalo = setInterval(tick, 60000);

    // Suscripción realtime a pedidos
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargarDatos)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mesas' }, cargarDatos)
      .subscribe();

    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, [cargarDatos]);

  const saludo = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const nombre = sesion?.usuario.nombre.split(' ')[0] || 'Chef';

  // Accesos rápidos según rol
  const accesoRapido = () => {
    const permisos = sesion?.permisos;
    const items = [];
    if (permisos?.pedidos_crear)      items.push({ href: '/pedidos',    icon: '📋', label: 'Nuevo pedido',    color: 'var(--orange)' });
    if (permisos?.kds_ver)            items.push({ href: '/cocina',     icon: '👨‍🍳', label: 'Ver cocina',     color: 'var(--green)' });
    if (permisos?.domicilios_propios) items.push({ href: '/domicilios', icon: '🛵', label: 'Mis domicilios', color: 'var(--status-transit)' });
    if (permisos?.menu_editar)        items.push({ href: '/menu',       icon: '🍽️', label: 'Activar menú',   color: 'var(--status-prep)' });
    if (permisos?.caja)               items.push({ href: '/caja',       icon: '💰', label: 'Abrir caja',     color: 'var(--status-ready)' });
    if (permisos?.compras_ver)        items.push({ href: '/compras',    icon: '🛒', label: 'Lista compras',  color: 'var(--text-secondary)' });
    return items;
  };

  if (cargando) {
    return (
      <div style={{ padding: 'var(--space-5)' }}>
        <div className="grid-4" style={{ marginTop: 'var(--space-5)' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--border-radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>

      {/* Header saludo */}
      <div className="page-header">
        <div className="page-title">
          <h1>{saludo()}, {nombre} 👋</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('es-CO', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })} · {horaActual}
          </p>
        </div>

        {/* Badge turno */}
        <div>
          {metricas.turnoAbierto ? (
            <span className="badge badge-green">
              ● Turno abierto desde {formatHora(metricas.turnoAbierto.fecha_apertura)}
            </span>
          ) : (
            <span className="badge badge-cancel">● Sin turno abierto</span>
          )}
        </div>
      </div>

      {/* Frase del día */}
      <div className="nm-card" style={{ marginBottom: 'var(--space-6)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--orange), var(--green))',
        }} />
        <p className="text-display" style={{
          fontSize: 'clamp(0.9rem, 2vw, 1.05rem)',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          fontStyle: 'italic',
        }}>
          "{mensajeDia.frase}"
        </p>
        <p style={{ marginTop: 'var(--space-2)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--orange)' }}>
          — {mensajeDia.autor}
        </p>
      </div>

      {/* Métricas */}
      <div className="section-title">Resumen de la jornada</div>
      <div className="grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card__icon">📋</div>
          <div className="stat-card__label">Pedidos activos</div>
          <div className="stat-card__value">{metricas.pedidosActivos}</div>
          <div className="stat-card__sub">en cocina o en ruta</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🪑</div>
          <div className="stat-card__label">Mesas ocupadas</div>
          <div className="stat-card__value">{metricas.mesasOcupadas}</div>
          <div className="stat-card__sub">en este momento</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🛵</div>
          <div className="stat-card__label">Domicilios en ruta</div>
          <div className="stat-card__value">{metricas.domiciliosEnRuta}</div>
          <div className="stat-card__sub">en camino</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">💰</div>
          <div className="stat-card__label">Ventas hoy</div>
          <div className="stat-card__value font-mono" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
            {formatCOP(metricas.ventasHoy)}
          </div>
          <div className="stat-card__sub">pedidos entregados</div>
        </div>
      </div>

      {/* Accesos rápidos */}
      {accesoRapido().length > 0 && (
        <>
          <div className="section-title">Accesos rápidos</div>
          <div className="grid-3" style={{ marginBottom: 'var(--space-6)' }}>
            {accesoRapido().map(item => (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div className="nm-card" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}>
                  <div style={{
                    width: 48, height: 48,
                    borderRadius: 'var(--border-radius-md)',
                    background: 'var(--bg-base)',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: item.color, fontSize: '0.9rem' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.href}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Aviso sin turno */}
      {!metricas.turnoAbierto && sesion?.permisos.caja && (
        <div className="nm-card" style={{
          borderLeft: '3px solid var(--status-pending)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--status-pending)' }}>⚠️ No hay turno de caja abierto</div>
            <p className="text-muted">Abre el turno antes de iniciar la jornada para registrar ventas correctamente.</p>
          </div>
          <Link href="/caja">
            <button className="btn btn-primary btn-sm">Abrir turno</button>
          </Link>
        </div>
      )}
    </div>
  );
}
