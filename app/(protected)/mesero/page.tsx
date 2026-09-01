'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type { Pedido, DetallePedido, EstadoPago, Cliente } from '@/lib/types';
import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { getInicioFinDiaColombia } from '@/lib/fechas';

type PedidoMesero = Pedido & {
  detalle: DetallePedido[];
};

type TabMesero = 'activos' | 'domicilios' | 'finalizados';

export default function MeseroPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [pedidosMesa, setPedidosMesa] = useState<PedidoMesero[]>([]);
  const [pedidosDomicilio, setPedidosDomicilio] = useState<PedidoMesero[]>([]);
  const [listaClientes, setListaClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabActual, setTabActual] = useState<TabMesero>('activos');

  // Filtros de mesa y nombre
  const [filtroMesa, setFiltroMesa] = useState<string>('todas');
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');

  const [selectedPedido, setSelectedPedido] = useState<PedidoMesero | null>(null);
  const [modalCobro, setModalCobro] = useState<PedidoMesero | null>(null);
  const [modalCliente, setModalCliente] = useState<PedidoMesero | null>(null);
  const [mensajeToast, setMensajeToast] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);

  // Formulario de datos de cliente
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteDireccion, setClienteDireccion] = useState('');
  const [guardarDirectorio, setGuardarDirectorio] = useState(true);

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

  const cargarDatos = useCallback(async () => {
    try {
      const { inicioIso: hoyInicioIso } = getInicioFinDiaColombia();
      const isMesero = sesion?.usuario?.rol === 'mesero';

      // 1. Cargar pedidos de mesa (solo del día para meseros)
      let queryMesas = supabase
        .from('pedidos')
        .select(`*, mesa:mesas!mesa_id(*), cliente:clientes(*), detalle:detalle_pedido(*, plato:platos(*))`)
        .eq('tipo', 'mesa')
        .not('estado', 'eq', 'cancelado');

      if (isMesero) {
        queryMesas = queryMesas.gte('fecha_creacion', hoyInicioIso);
      }

      const { data: dataMesas, error: errMesas } = await queryMesas.order('fecha_creacion', { ascending: false });

      if (errMesas) {
        console.error('[Mesero] fetch mesas error:', errMesas);
      } else if (dataMesas) {
        setPedidosMesa(dataMesas as PedidoMesero[]);
      }

      // 2. Cargar pedidos de domicilio (solo del día para meseros)
      let queryDom = supabase
        .from('pedidos')
        .select(`*, cliente:clientes(*), repartidor:usuarios!repartidor_id(*), detalle:detalle_pedido(*, plato:platos(*))`)
        .eq('tipo', 'domicilio')
        .not('estado', 'eq', 'cancelado');

      if (isMesero) {
        queryDom = queryDom.gte('fecha_creacion', hoyInicioIso);
      }

      const { data: dataDom, error: errDom } = await queryDom.order('fecha_creacion', { ascending: false });

      if (errDom) {
        console.error('[Mesero] fetch doms error:', errDom);
      } else if (dataDom) {
        setPedidosDomicilio(dataDom as PedidoMesero[]);
      }

      // 3. Cargar clientes registrados para autocompletado
      const { data: dataClientes } = await supabase.from('clientes').select('*').order('nombre');
      if (dataClientes) setListaClientes(dataClientes as Cliente[]);
    } catch (err) {
      console.error('[Mesero] catch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, sesion?.usuario?.rol]);

  useEffect(() => {
    cargarDatos();

    const channel = supabase
      .channel('mesero-realtime-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargarDatos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_pedido' }, cargarDatos)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cargarDatos, supabase]);

  // Tomar un domicilio sin asignar
  const handleTomarDomicilio = async (pedido: PedidoMesero) => {
    if (!sesion?.usuario?.id) return;
    setSaving(true);
    const updatePayload: Record<string, any> = {
      domiciliario_id: sesion.usuario.id,
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
      toast('Error al tomar domicilio: ' + error.message, 'error');
    } else {
      toast(`🛵 Domicilio #${pedido.numero_pedido} asignado a ti correctamente.`, 'exito');
      cargarDatos();
    }
  };

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
      toast('Error al marcar entregado: ' + error.message, 'error');
    } else {
      toast(`🍽️ Pedido #${pedido.numero_pedido} marcado como ENTREGADO A MESA`, 'exito');
      cargarDatos();
    }
  };

  // Abrir modal de cobro
  const handleOpenCobro = (pedido: PedidoMesero) => {
    setModalCobro(pedido);
    setEstadoPagoCobro('pagado');
    setMetodoPago('efectivo');
    setMontoEfectivo(pedido.total);
    setMontoTransferencia(0);
    setLiberarMesa(true);
  };

  // Abrir modal de cliente
  const handleOpenCliente = (pedido: PedidoMesero) => {
    setModalCliente(pedido);
    setClienteNombre(pedido.cliente?.nombre || pedido.cliente_nombre_rapido || '');
    setClienteTelefono(pedido.cliente?.telefono || pedido.cliente_telefono_rapido || '');
    setClienteDireccion(pedido.cliente?.direccion || '');
    setGuardarDirectorio(true);
  };

  // Guardar datos de cliente en pedido / directorio
  const handleGuardarCliente = async () => {
    if (!modalCliente) return;
    if (!clienteNombre.trim()) {
      toast('Ingresa el nombre del cliente', 'error');
      return;
    }

    setSaving(true);
    try {
      let finalClienteId = modalCliente.cliente_id;

      // Si se marcó guardar en directorio de clientes y hay teléfono
      if (guardarDirectorio && clienteTelefono.trim()) {
        const { data: clienteUpsert, error: clientErr } = await supabase
          .from('clientes')
          .upsert(
            {
              nombre: clienteNombre.trim(),
              telefono: clienteTelefono.trim(),
              direccion: clienteDireccion.trim() || null
            },
            { onConflict: 'telefono' }
          )
          .select('id')
          .maybeSingle();

        if (!clientErr && clienteUpsert) {
          finalClienteId = clienteUpsert.id;
        }
      }

      // Actualizar pedido
      const { error: pedErr } = await supabase
        .from('pedidos')
        .update({
          cliente_id: finalClienteId,
          cliente_nombre_rapido: clienteNombre.trim(),
          cliente_telefono_rapido: clienteTelefono.trim() || null
        })
        .eq('id', modalCliente.id);

      if (pedErr) {
        toast('Error al guardar datos del cliente: ' + pedErr.message, 'error');
      } else {
        toast(`✅ Datos de cliente actualizados para Pedido #${modalCliente.numero_pedido}`, 'exito');
        setModalCliente(null);
        cargarDatos();
      }
    } catch (err: any) {
      toast('Error inesperado: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Ejecutar cobro y cierre
  const handleConfirmarCobro = async () => {
    if (!modalCobro) return;
    setSaving(true);

    try {
      const updatePayload: Record<string, any> = {
        estado_pago: estadoPagoCobro,
        monto_efectivo: estadoPagoCobro === 'pagado' && (metodoPago === 'efectivo' || metodoPago === 'mixto') ? montoEfectivo : 0,
        monto_transferencia: estadoPagoCobro === 'pagado' && (metodoPago === 'transferencia' || metodoPago === 'mixto') ? montoTransferencia : 0,
        cuenta_destino: estadoPagoCobro === 'pagado' && (metodoPago === 'transferencia' || metodoPago === 'mixto') ? (cuentaDestino.trim() || null) : null,
        estado: 'entregado'
      };

      let { error: errPedido } = await supabase
        .from('pedidos')
        .update(updatePayload)
        .eq('id', modalCobro.id);

      if (errPedido && errPedido.message?.includes('cuenta_destino')) {
        delete updatePayload.cuenta_destino;
        const retry = await supabase
          .from('pedidos')
          .update(updatePayload)
          .eq('id', modalCobro.id);
        errPedido = retry.error;
      }

      if (errPedido) throw errPedido;

      if (liberarMesa && modalCobro.mesa_id) {
        await supabase
          .from('mesas')
          .update({ estado: 'libre' })
          .eq('id', modalCobro.mesa_id);
      }

      toast(`✅ Pedido #${modalCobro.numero_pedido} cerrado correctamente (${estadoPagoCobro.toUpperCase()})`, 'exito');
      setModalCobro(null);
      cargarDatos();
    } catch (err: any) {
      toast('Error al procesar cobro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Listas base
  const rawPedidosActivos = useMemo(() => {
    return pedidosMesa.filter((p) => p.estado !== 'entregado' || p.estado_pago !== 'pagado');
  }, [pedidosMesa]);

  const rawPedidosFinalizados = useMemo(() => {
    return pedidosMesa.filter((p) => p.estado === 'entregado' && p.estado_pago === 'pagado');
  }, [pedidosMesa]);

  // Lista de mesas únicas para selector de filtro
  const mesasUnicas = useMemo(() => {
    const set = new Set<string>();
    pedidosMesa.forEach((p) => {
      if (p.mesa?.numero) set.add(String(p.mesa.numero));
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [pedidosMesa]);

  // Función genérica para aplicar filtros por mesa y búsqueda por texto
  const aplicarFiltros = (lista: PedidoMesero[]) => {
    return lista.filter((p) => {
      // 1. Filtro de Mesa
      if (filtroMesa !== 'todas') {
        const numMesa = String(p.mesa?.numero || '');
        if (numMesa !== filtroMesa) return false;
      }
      // 2. Filtro de Texto (Nombre cliente, mesa, platillos, #pedido)
      if (busquedaTexto.trim()) {
        const q = busquedaTexto.toLowerCase().trim();
        const numPed = String(p.numero_pedido || '');
        const numMesa = String(p.mesa?.numero || '');
        const nombreCli = (p.cliente?.nombre || p.cliente_nombre_rapido || '').toLowerCase();
        const telCli = (p.cliente?.telefono || p.cliente_telefono_rapido || '').toLowerCase();
        const platosStr = (p.detalle || []).map(d => d.plato?.nombre || '').join(' ').toLowerCase();

        const coincide = numPed.includes(q) || numMesa.includes(q) || nombreCli.includes(q) || telCli.includes(q) || platosStr.includes(q);
        if (!coincide) return false;
      }
      return true;
    });
  };

  const pedidosActivos = aplicarFiltros(rawPedidosActivos);
  const pedidosDomicilioFiltrados = aplicarFiltros(pedidosDomicilio);
  const pedidosFinalizados = aplicarFiltros(rawPedidosFinalizados);

  const listosCount = pedidosMesa.filter((p) => p.estado === 'listo').length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-4)' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="page-title">
          <h1>🪑 Servicio de Meseros</h1>
          <span className="page-subtitle">Atención a mesas, comandas activas y consulta de domicilios</span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: 'var(--green-dark)', fontSize: '1rem' }}>
              🔔 ¡Atención! Hay {listosCount} comanda{listosCount !== 1 ? 's' : ''} LISTA{listosCount !== 1 ? 'S' : ''} en cocina para llevar a mesa!
            </span>
            <button className="btn btn-sm btn-success" onClick={() => setTabActual('activos')}>
              👁️ Ver Pendientes
            </button>
          </div>
        </div>
      )}

      {/* Barra de Filtros: Por Mesa y por Buscador */}
      <div className="nm-card" style={{ padding: '12px 16px', marginBottom: 'var(--space-4)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            🔎 BUSCAR POR NOMBRE / CLIENTE / PLATILLO
          </label>
          <input
            type="text"
            className="form-input"
            value={busquedaTexto}
            onChange={(e) => setBusquedaTexto(e.target.value)}
            placeholder="Ej: Pedro, Mesa 3, Sopa, #12..."
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: '0 0 180px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            🪑 FILTRAR POR MESA
          </label>
          <select
            className="form-select"
            value={filtroMesa}
            onChange={(e) => setFiltroMesa(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="todas">Todas las mesas</option>
            {mesasUnicas.map((m) => (
              <option key={m} value={m}>Mesa {m}</option>
            ))}
          </select>
        </div>

        {(busquedaTexto || filtroMesa !== 'todas') && (
          <button
            type="button"
            className="btn btn-sm btn-neutral"
            onClick={() => { setBusquedaTexto(''); setFiltroMesa('todas'); }}
            style={{ marginTop: '18px' }}
          >
            ✕ Limpiar Filtros
          </button>
        )}
      </div>

      {/* Tabs principales */}
      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          className={`tab-btn ${tabActual === 'activos' ? 'active' : ''}`}
          onClick={() => setTabActual('activos')}
        >
          🔥 Pedidos en Servicio ({pedidosActivos.length})
        </button>
        <button
          className={`tab-btn ${tabActual === 'domicilios' ? 'active' : ''}`}
          onClick={() => setTabActual('domicilios')}
        >
          🛵 Consulta Domicilios ({pedidosDomicilioFiltrados.length})
        </button>
        <button
          className={`tab-btn ${tabActual === 'finalizados' ? 'active' : ''}`}
          onClick={() => setTabActual('finalizados')}
        >
          🏁 Finalizados ({pedidosFinalizados.length})
        </button>
      </div>

      {/* VISTA 1: PEDIDOS ACTIVOS EN SERVICIO */}
      {tabActual === 'activos' && (
        <>
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>⏳ Cargando comandas activas…</div>
          ) : pedidosActivos.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">✨</span>
              <p className="empty-state__title">No hay comandas que coincidan</p>
              <p className="empty-state__desc">Intenta ajustar los filtros de mesa o búsqueda.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {pedidosActivos.map((pedido) => {
                const isListo = pedido.estado === 'listo';
                const isEntregado = pedido.estado === 'entregado';
                const itemsCount = (pedido.detalle || []).reduce((acc, i) => acc + i.cantidad, 0);
                const nombreCli = pedido.cliente?.nombre || pedido.cliente_nombre_rapido || 'Cliente ocasional';

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
                        #{pedido.numero_pedido}
                      </span>
                      <span className={`badge badge-${isListo ? 'ready' : isEntregado ? 'done' : 'prep'}`}>
                        {isListo ? '✅ LISTO PARA SERVIR' : isEntregado ? '🍽️ Entregado' : '🔥 En Cocina'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        🪑 Mesa {pedido.mesa?.numero || 'N/A'} {pedido.mesa?.nombre ? `(${pedido.mesa.nombre})` : ''}
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: '0.78rem' }}
                        title="Registrar / editar datos del cliente"
                        onClick={() => handleOpenCliente(pedido)}
                      >
                        ✏️ {nombreCli}
                      </button>
                    </div>

                    <div className="nm-inset" style={{ padding: 'var(--space-3)', borderRadius: 'var(--border-radius-md)' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {itemsCount} ítem{itemsCount !== 1 ? 's' : ''} en comanda:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                        {(pedido.detalle || []).map((item) => (
                          <li key={item.id} style={{ marginBottom: '2px' }}>
                            <strong>{item.cantidad}x</strong> {item.plato?.nombre || 'Plato'}{' '}
                            {item.modificaciones && (
                              <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                                ({item.modificaciones})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--orange-dark)' }}>
                        ${pedido.total.toLocaleString('es-CO')}
                      </span>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(pedido)}>
                        👁️ Ver Detalle
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {isListo && (
                        <button className="btn btn-success btn-full" onClick={() => handleEntregarAMesa(pedido)} disabled={saving}>
                          🍽️ Marcar Entregado a Mesa
                        </button>
                      )}

                      <button className="btn btn-primary btn-full" onClick={() => handleOpenCobro(pedido)} disabled={saving}>
                        💰 Finalizar & Cobrar Mesa
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VISTA 2: CONSULTA DE DOMICILIOS */}
      {tabActual === 'domicilios' && (
        <>
          <div className="nm-card" style={{ marginBottom: 'var(--space-4)', background: '#F8F9FA' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              ℹ️ <strong>Vista de Consulta para Meseros:</strong> Utiliza esta lista para responder rápidamente a clientes que llamen por teléfono a preguntar sobre el estado de su domicilio.
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>⏳ Cargando domicilios…</div>
          ) : pedidosDomicilioFiltrados.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🛵</span>
              <p className="empty-state__title">Sin domicilios coincidentes</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {pedidosDomicilioFiltrados.map((dom) => {
                const clienteNombre = dom.cliente?.nombre || dom.cliente_nombre_rapido || 'Cliente Domicilio';
                const clienteTel = dom.cliente?.telefono || dom.cliente_telefono_rapido || 'Sin teléfono';
                const repartidorNombre = (dom as any).repartidor?.nombre || 'Pendiente por asignar';

                return (
                  <div key={dom.id} className="nm-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
                        #{dom.numero_pedido}
                      </span>
                      <span className={`badge badge-${dom.estado === 'entregado' ? 'done' : dom.estado === 'en_camino' ? 'transit' : 'prep'}`}>
                        {dom.estado === 'pendiente' ? '⏳ Recibido' : dom.estado === 'preparacion' ? '🔥 En Cocina' : dom.estado === 'listo' ? '✅ Empacado' : dom.estado === 'en_camino' ? '🛵 En camino' : '🏁 Entregado'}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>👤 {clienteNombre}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📞 {clienteTel}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📍 {dom.cliente?.direccion || dom.notas_generales || 'Retiro en local'}</div>
                    </div>

                    <div className="nm-inset" style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Repartidor asignado:</span>
                      <div style={{ fontWeight: 600 }}>🛵 {repartidorNombre}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--orange-dark)' }}>${dom.total.toLocaleString('es-CO')}</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!dom.domiciliario_id && dom.estado !== 'entregado' && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleTomarDomicilio(dom)} disabled={saving}>
                            🛵 Tomar Domicilio
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(dom)}>
                          👁️ Ver Platos
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VISTA 3: PEDIDOS FINALIZADOS */}
      {tabActual === 'finalizados' && (
        <>
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>⏳ Cargando finalizados…</div>
          ) : pedidosFinalizados.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🏁</span>
              <p className="empty-state__title">Sin pedidos finalizados</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {pedidosFinalizados.map((pedido) => (
                <div key={pedido.id} className="nm-card" style={{ opacity: 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 800 }}>#{pedido.numero_pedido} — Mesa {pedido.mesa?.numero || 'N/A'}</span>
                    <span className="badge badge-done">🏁 Pagado & Servido</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                    Total: <strong>${pedido.total.toLocaleString('es-CO')}</strong>
                  </div>
                  <button className="btn btn-sm btn-neutral btn-full" onClick={() => setSelectedPedido(pedido)}>
                    👁️ Ver Detalle
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL EDITAR DATOS CLIENTE DE PEDIDO */}
      {modalCliente && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalCliente(null)}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal__header">
              <h3>👤 Datos del Cliente — Pedido #{modalCliente.numero_pedido}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalCliente(null)}>✕</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <ClienteSearchPicker
                  clientes={listaClientes}
                  onSelectCliente={(c) => {
                    if (c) {
                      setClienteNombre(c.nombre || '');
                      setClienteTelefono(c.telefono || '');
                      setClienteDireccion(c.direccion || '');
                    }
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre del Cliente *</label>
                <input
                  type="text"
                  className="form-input"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Ej: Carlos Pérez"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número de Teléfono / Celular (Opcional)</label>
                <input
                  type="tel"
                  className="form-input"
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder="Ej: 300 123 4567"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dirección (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={clienteDireccion}
                  onChange={(e) => setClienteDireccion(e.target.value)}
                  placeholder="Ej: Calle 10 # 5-20"
                />
              </div>

              <label className="nm-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={guardarDirectorio}
                  onChange={(e) => setGuardarDirectorio(e.target.checked)}
                />
                <span className="nm-checkbox-box" />
                <span>☑️ Guardar como cliente registrado en la base de datos</span>
              </label>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalCliente(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleGuardarCliente} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE PEDIDO */}
      {selectedPedido && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedPedido(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal__header">
              <h3>Pedido #{selectedPedido.numero_pedido} — {selectedPedido.tipo === 'mesa' ? `Mesa ${selectedPedido.mesa?.numero || ''}` : 'Domicilio'}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(null)}>✕</button>
            </div>
            <div className="modal__body">
              <p><strong>Cliente:</strong> {selectedPedido.cliente?.nombre || selectedPedido.cliente_nombre_rapido || 'Cliente Ocasional'}</p>
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
              {selectedPedido.tipo === 'mesa' && selectedPedido.estado !== 'entregado' && (
                <button className="btn btn-primary" onClick={() => handleOpenCobro(selectedPedido)}>💰 Cobrar Mesa</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COBRO */}
      {modalCobro && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalCobro(null)}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal__header">
              <h3>💰 Cobro Mesa {modalCobro.mesa?.numero} — Pedido #{modalCobro.numero_pedido}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalCobro(null)}>✕</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', padding: 'var(--space-3)', borderRadius: 'var(--border-radius-md)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Monto a Cobrar:</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--orange-dark)' }}>
                  ${modalCobro.total.toLocaleString('es-CO')}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Estado del Pago</label>
                <select className="form-select" value={estadoPagoCobro} onChange={(e) => setEstadoPagoCobro(e.target.value as EstadoPago)}>
                  <option value="pagado">✅ Pagado inmediatamente</option>
                  <option value="fiado">⏳ Fiado / Pendiente por cobrar luego</option>
                </select>
              </div>

              {estadoPagoCobro === 'pagado' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Método de Pago</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <button type="button" className={`btn btn-sm ${metodoPago === 'efectivo' ? 'btn-primary' : 'btn-neutral'}`} onClick={() => { setMetodoPago('efectivo'); setMontoEfectivo(modalCobro.total); setMontoTransferencia(0); }}>
                        💵 Efectivo
                      </button>
                      <button type="button" className={`btn btn-sm ${metodoPago === 'transferencia' ? 'btn-primary' : 'btn-neutral'}`} onClick={() => { setMetodoPago('transferencia'); setMontoTransferencia(modalCobro.total); setMontoEfectivo(0); }}>
                        📲 Nequi/Transf
                      </button>
                      <button type="button" className={`btn btn-sm ${metodoPago === 'mixto' ? 'btn-primary' : 'btn-neutral'}`} onClick={() => { setMetodoPago('mixto'); setMontoEfectivo(modalCobro.total / 2); setMontoTransferencia(modalCobro.total / 2); }}>
                        💳 Mixto
                      </button>
                    </div>
                  </div>

                  {(metodoPago === 'efectivo' || metodoPago === 'mixto') && (
                    <div className="form-group">
                      <label className="form-label">Monto en Efectivo ($)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={montoEfectivo}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setMontoEfectivo(val);
                          if (metodoPago === 'mixto' && modalCobro) {
                            setMontoTransferencia(Math.max(0, modalCobro.total - val));
                          }
                        }}
                      />
                    </div>
                  )}

                  {(metodoPago === 'transferencia' || metodoPago === 'mixto') && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Monto Transferencia ($)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={montoTransferencia}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setMontoTransferencia(val);
                            if (metodoPago === 'mixto' && modalCobro) {
                              setMontoEfectivo(Math.max(0, modalCobro.total - val));
                            }
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Banco / Nota de Transferencia (Opcional)</label>
                        <input type="text" className="form-input" value={cuentaDestino} onChange={(e) => setCuentaDestino(e.target.value)} placeholder="Ej: Nequi, Bancolombia, Daviplata, etc." />
                      </div>
                    </>
                  )}
                </>
              )}

              <label className="nm-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '8px' }}>
                <input type="checkbox" checked={liberarMesa} onChange={(e) => setLiberarMesa(e.target.checked)} />
                <span className="nm-checkbox-box" />
                <span>🪑 Liberar Mesa {modalCobro.mesa?.numero} automáticamente</span>
              </label>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalCobro(null)}>Cancelar</button>
              <button className="btn btn-success" onClick={handleConfirmarCobro} disabled={saving}>
                {saving ? 'Procesando…' : 'Finalizar y Cerrar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
