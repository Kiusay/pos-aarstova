'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import {
  Pedido,
  PizarraItem,
  Mesa,
  Cliente,
  Usuario,
  RestauranteConfig,
  EstadoPedido,
  EstadoPago
} from '@/lib/types';
import jsPDF from 'jspdf';

interface CartItem {
  pizarra_id: string;
  plato_id: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  modificaciones: string;
  ronda: number;
  disponibles: number | null;
}

export default function PedidosPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [vista, setVista] = useState<'lista' | 'nuevo'>('lista');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroFecha, setFiltroFecha] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [filtroMesa, setFiltroMesa] = useState<string>('todas');
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');

  // Datos para creación de pedido
  const [pizarra, setPizarra] = useState<PizarraItem[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<Usuario[]>([]);
  const [config, setConfig] = useState<RestauranteConfig | null>(null);

  // Formulario nuevo pedido
  const [tipo, setTipo] = useState<'mesa' | 'domicilio'>('mesa');
  const [mesaId, setMesaId] = useState<string>('');
  const [clienteId, setClienteId] = useState<string>('');
  const [clienteNombreRapido, setClienteNombreRapido] = useState('');
  const [clienteTelefonoRapido, setClienteTelefonoRapido] = useState('');
  const [direccionEntrega, setDireccionEntrega] = useState('');
  const [barrioEntrega, setBarrioEntrega] = useState('');
  const [notasEntrega, setNotasEntrega] = useState('');
  const [domiciliarioId, setDomiciliarioId] = useState<string>('');
  const [guardarDirectorio, setGuardarDirectorio] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [rondaActual, setRondaActual] = useState(1);
  const [numComensales, setNumComensales] = useState(1);

  const [propinaActiva, setPropinaActiva] = useState(false);
  const [propinaValor, setPropinaValor] = useState(0);
  const [descuentoActivo, setDescuentoActivo] = useState(false);
  const [descuentoTipo, setDescuentoTipo] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [descuentoValor, setDescuentoValor] = useState(0);
  const [costoDomicilio, setCostoDomicilio] = useState(0);

  const [estadoPago, setEstadoPago] = useState<EstadoPago>('pendiente_pago');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'mixto'>('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [cuentaDestino, setCuentaDestino] = useState('');
  const [notasGenerales, setNotasGenerales] = useState('');

  const [mensajeModal, setMensajeModal] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    cargarDatos();

    const channel = supabase
      .channel('pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        cargarDatos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filtroFecha]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const isMesero = sesion?.usuario?.rol === 'mesero';

      // Cargar pedidos (filtrar solo del día si es mesero)
      let queryPed = supabase
        .from('pedidos')
        .select('*, mesa:mesas!mesa_id(*), cliente:clientes(*), detalle:detalle_pedido(*, plato:platos(*))');

      if (isMesero) {
        queryPed = queryPed.gte('fecha_creacion', hoyInicio.toISOString());
      }

      const { data: dataPedidos, error: errPed } = await queryPed.order('fecha_creacion', { ascending: false });

      if (errPed) console.error('Error al cargar pedidos:', errPed);
      if (dataPedidos) setPedidos(dataPedidos as Pedido[]);

      // Cargar pizarra del día
      const { data: dataPizarra } = await supabase
        .from('pizarra_diaria')
        .select('*, plato:platos(*, categoria:categorias_menu(*))')
        .eq('fecha', todayStr)
        .eq('activo', true);
      if (dataPizarra) setPizarra(dataPizarra as PizarraItem[]);

      // Cargar mesas
      const { data: dataMesas } = await supabase
        .from('mesas')
        .select('*')
        .eq('activa', true)
        .order('numero');
      if (dataMesas) setMesas(dataMesas as Mesa[]);

      // Cargar clientes
      const { data: dataClientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      if (dataClientes) setClientes(dataClientes as Cliente[]);

      // Cargar domiciliarios
      const { data: dataDom } = await supabase
        .from('usuarios')
        .select('*')
        .eq('rol', 'domiciliario')
        .eq('activo', true);
      if (dataDom) setDomiciliarios(dataDom as Usuario[]);

      // Cargar config
      const { data: dataConfig } = await supabase
        .from('restaurante_config')
        .select('*')
        .single();
      if (dataConfig) setConfig(dataConfig as RestauranteConfig);
    } catch (e) {
      console.error('Error en cargarDatos:', e);
    } finally {
      setLoading(false);
    }
  };

  // Agregar plato al carrito
  const agregarAlCarrito = (item: PizarraItem) => {
    const plato = item.plato;
    if (!plato) return;

    const disponibleReal = item.disponibles !== null ? item.disponibles - item.vendidos : Infinity;
    const existente = cart.find(c => c.pizarra_id === item.id && c.ronda === rondaActual);

    if (existente) {
      if (existente.cantidad + 1 > disponibleReal) {
        setMensajeModal({ tipo: 'error', texto: `No hay más cupo disponible para ${plato.nombre}` });
        return;
      }
      setCart(cart.map(c => c === existente ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else {
      if (1 > disponibleReal) {
        setMensajeModal({ tipo: 'error', texto: `Plato agotado: ${plato.nombre}` });
        return;
      }
      setCart([...cart, {
        pizarra_id: item.id,
        plato_id: plato.id,
        nombre: plato.nombre,
        precio_unitario: item.precio_hoy,
        cantidad: 1,
        modificaciones: '',
        ronda: rondaActual,
        disponibles: item.disponibles
      }]);
    }
  };

  const modificarCantidadCart = (index: number, delta: number) => {
    const updated = [...cart];
    const item = updated[index];
    const nuevaCant = item.cantidad + delta;
    if (nuevaCant <= 0) {
      updated.splice(index, 1);
    } else {
      item.cantidad = nuevaCant;
    }
    setCart(updated);
  };

  const modificarNotasCart = (index: number, texto: string) => {
    const updated = [...cart];
    updated[index].modificaciones = texto;
    setCart(updated);
  };

  // Cálculos de montos
  const subtotal = cart.reduce((acc, item) => acc + (item.precio_unitario * item.cantidad), 0);
  const valDescuento = descuentoActivo 
    ? (descuentoTipo === 'porcentaje' ? (subtotal * descuentoValor) / 100 : descuentoValor)
    : 0;
  const valCostoDom = tipo === 'domicilio' ? costoDomicilio : 0;
  const valPropina = propinaActiva ? propinaValor : 0;
  const totalGeneral = Math.max(0, subtotal - valDescuento + valCostoDom + valPropina);

  // Enviar pedido
  const handleCrearPedido = async () => {
    if (cart.length === 0) {
      setMensajeModal({ tipo: 'error', texto: 'El carrito está vacío.' });
      return;
    }
    if (tipo === 'mesa' && !mesaId) {
      setMensajeModal({ tipo: 'error', texto: 'Por favor selecciona una mesa.' });
      return;
    }
    if (tipo === 'domicilio' && !clienteId && (!clienteNombreRapido || !clienteTelefonoRapido)) {
      setMensajeModal({ tipo: 'error', texto: 'Por favor selecciona o ingresa los datos del cliente.' });
      return;
    }

    setSaving(true);
    setMensajeModal(null);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const currentUserId = sesion?.usuario?.id || authUser?.id || null;

      // 1. Obtener siguiente número de pedido
      const { data: maxPedido } = await supabase
        .from('pedidos')
        .select('numero_pedido')
        .order('numero_pedido', { ascending: false })
        .limit(1);
      const numPedido = maxPedido && maxPedido[0] ? maxPedido[0].numero_pedido + 1 : 1;

      // 2. Obtener turno abierto si existe
      const { data: turnoAbierto } = await supabase
        .from('turnos_caja')
        .select('id')
        .eq('estado', 'abierto')
        .maybeSingle();

      // Guardar cliente en directorio si fue solicitado y se ingresaron datos
      let finalClienteId = clienteId || null;
      if (!finalClienteId && clienteNombreRapido.trim() && clienteTelefonoRapido.trim() && guardarDirectorio) {
        const { data: cUpsert } = await supabase
          .from('clientes')
          .upsert(
            {
              nombre: clienteNombreRapido.trim(),
              telefono: clienteTelefonoRapido.trim(),
              direccion: direccionEntrega.trim() || null,
              barrio: barrioEntrega.trim() || null,
              notas_entrega: notasEntrega.trim() || null
            },
            { onConflict: 'telefono' }
          )
          .select('id')
          .maybeSingle();

        if (cUpsert) {
          finalClienteId = cUpsert.id;
        }
      }

      // Obtener cliente seleccionado si existe
      const selectedClienteObj = clientes.find((c) => c.id === clienteId);
      const nombreFinal = clienteNombreRapido.trim() || selectedClienteObj?.nombre || null;
      const telefonoFinal = clienteTelefonoRapido.trim() || selectedClienteObj?.telefono || null;
      const direccionFinal = direccionEntrega.trim() || selectedClienteObj?.direccion || null;
      const barrioFinal = barrioEntrega.trim() || selectedClienteObj?.barrio || null;
      const notasEntregaFinal = notasEntrega.trim() || selectedClienteObj?.notas_entrega || null;

      let notasFinales = notasGenerales.trim();
      if (tipo === 'domicilio') {
        const partes: string[] = [];
        if (direccionFinal) partes.push(`📍 Dirección: ${direccionFinal}`);
        if (barrioFinal) partes.push(`🏘️ Barrio: ${barrioFinal}`);
        if (notasEntregaFinal) partes.push(`⚠️ Indicaciones: ${notasEntregaFinal}`);
        if (notasFinales) partes.push(`📝 Obs: ${notasFinales}`);
        notasFinales = partes.join(' | ');
      }

      // 3. Crear pedido
      const newPedidoPayload = {
        numero_pedido: numPedido,
        tipo,
        mesa_id: tipo === 'mesa' ? mesaId : null,
        cliente_id: finalClienteId,
        cliente_nombre_rapido: nombreFinal,
        cliente_telefono_rapido: telefonoFinal,
        domiciliario_id: tipo === 'domicilio' && domiciliarioId ? domiciliarioId : null,
        estado: 'pendiente' as EstadoPedido,
        estado_pago: estadoPago,
        num_comensales: numComensales,
        subtotal,
        descuento_tipo: descuentoActivo ? descuentoTipo : null,
        descuento_valor: descuentoActivo ? descuentoValor : 0,
        costo_domicilio: valCostoDom,
        propina: valPropina,
        total: totalGeneral,
        monto_efectivo: estadoPago === 'pagado' && (metodoPago === 'efectivo' || metodoPago === 'mixto') ? montoEfectivo : 0,
        monto_transferencia: estadoPago === 'pagado' && (metodoPago === 'transferencia' || metodoPago === 'mixto') ? montoTransferencia : 0,
        cuenta_destino: cuentaDestino || null,
        notas_generales: notasFinales || null,
        creado_por: currentUserId,
        turno_id: turnoAbierto?.id || null
      };

      let { data: createdPedido, error: errorPed } = await supabase
        .from('pedidos')
        .insert(newPedidoPayload)
        .select()
        .single();

      if (errorPed && newPedidoPayload.creado_por) {
        console.warn('Retry creating order with creado_por null due to FK/RLS fallback:', errorPed);
        const retryPayload = { ...newPedidoPayload, creado_por: null };
        const retry = await supabase.from('pedidos').insert(retryPayload).select().single();
        createdPedido = retry.data;
        errorPed = retry.error;
      }

      if (errorPed || !createdPedido) throw errorPed || new Error('No se pudo crear el pedido');

      // 4. Insertar detalles y llamar a decrementar_cupo
      for (const item of cart) {
        const { error: errDet } = await supabase
          .from('detalle_pedido')
          .insert({
            pedido_id: createdPedido.id,
            plato_id: item.plato_id,
            ronda: item.ronda,
            estado_item: 'enviado_cocina',
            cantidad: item.cantidad,
            modificaciones: item.modificaciones || null,
            precio_unitario: item.precio_unitario
          });

        if (errDet) {
          console.error('Error al guardar detalle:', errDet);
          throw new Error('Error guardando ítem del pedido: ' + errDet.message);
        }

        // RPC cupo atómico
        await supabase.rpc('decrementar_cupo', { p_pizarra_id: item.pizarra_id });
      }

      // 5. Actualizar estado de mesa si es mesa
      if (tipo === 'mesa' && mesaId) {
        await supabase.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaId);
      }

      setMensajeModal({ tipo: 'exito', texto: `Pedido #${numPedido} creado y enviado a cocina con éxito!` });
      resetForm();
      setVista('lista');
      cargarDatos();
    } catch (err: any) {
      console.error(err);
      setMensajeModal({ tipo: 'error', texto: err.message || 'Error al procesar el pedido' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setMesaId('');
    setClienteId('');
    setClienteNombreRapido('');
    setClienteTelefonoRapido('');
    setNotasGenerales('');
    setPropinaActiva(false);
    setPropinaValor(0);
    setDescuentoActivo(false);
    setDescuentoValor(0);
    setCostoDomicilio(0);
    setRondaActual(1);
    setEstadoPago('pendiente_pago');
  };

  // Generación de PDF de Recibo
  const generarPDFRecibo = (pedido: Pedido) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] }); // Formato ticket térmico / compacto
    let y = 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(config?.nombre || 'Restaurante Áarstova', 40, y, { align: 'center' });
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (config?.slogan) {
      doc.text(config.slogan, 40, y, { align: 'center' });
      y += 4;
    }
    if (config?.direccion) {
      doc.text(`Dir: ${config.direccion}`, 40, y, { align: 'center' });
      y += 4;
    }
    if (config?.whatsapp_principal) {
      doc.text(`WA: ${config.whatsapp_principal}`, 40, y, { align: 'center' });
      y += 5;
    }

    doc.text('------------------------------------------------', 40, y, { align: 'center' });
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text(`PEDIDO #${pedido.numero_pedido}`, 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(pedido.fecha_creacion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 70, y, { align: 'right' });
    y += 5;

    doc.text(`Tipo: ${pedido.tipo === 'mesa' ? `Mesa ${pedido.mesa?.numero || ''}` : 'Domicilio'}`, 10, y);
    y += 4;
    if (pedido.cliente || pedido.cliente_nombre_rapido) {
      doc.text(`Cliente: ${pedido.cliente?.nombre || pedido.cliente_nombre_rapido}`, 10, y);
      y += 4;
    }

    doc.text('------------------------------------------------', 40, y, { align: 'center' });
    y += 4;

    // Items
    pedido.detalle?.forEach((item) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.cantidad}x ${item.plato?.nombre || 'Plato'}`, 10, y);
      doc.text(`$${item.subtotal.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
      y += 4;
      if (item.modificaciones) {
        doc.setFont('helvetica', 'italic');
        doc.text(`   Nota: ${item.modificaciones}`, 10, y);
        y += 4;
      }
    });

    doc.setFont('helvetica', 'normal');
    doc.text('------------------------------------------------', 40, y, { align: 'center' });
    y += 4;

    doc.text(`Subtotal:`, 10, y);
    doc.text(`$${pedido.subtotal.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
    y += 4;

    if (pedido.descuento_valor > 0) {
      doc.text(`Descuento:`, 10, y);
      doc.text(`-$${pedido.descuento_valor.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
      y += 4;
    }
    if (pedido.costo_domicilio > 0) {
      doc.text(`Domicilio:`, 10, y);
      doc.text(`+$${pedido.costo_domicilio.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
      y += 4;
    }
    if (pedido.propina > 0) {
      doc.text(`Propina (Voluntaria):`, 10, y);
      doc.text(`+$${pedido.propina.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
      y += 4;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL:`, 10, y);
    doc.text(`$${pedido.total.toLocaleString('es-CO')}`, 70, y, { align: 'right' });
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Estado pago: ${pedido.estado_pago.toUpperCase()}`, 10, y);
    y += 6;

    if (config?.pie_factura_texto) {
      doc.setFontSize(8);
      doc.text(config.pie_factura_texto, 40, y, { align: 'center' });
    }

    doc.save(`Recibo_Pedido_${pedido.numero_pedido}.pdf`);
  };

  // Lista de mesas únicas para filtro
  const mesasUnicas = useMemo(() => {
    const set = new Set<string>();
    pedidos.forEach((p) => {
      if (p.mesa?.numero) set.add(String(p.mesa.numero));
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [pedidos]);

  // Filtrado de lista en /pedidos
  const pedidosFiltrados = pedidos.filter(p => {
    // 1. Filtro por estado
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;

    // 2. Filtro por mesa
    if (filtroMesa !== 'todas') {
      const numMesa = String(p.mesa?.numero || '');
      if (numMesa !== filtroMesa) return false;
    }

    // 3. Filtro por texto (cliente, mesa, #pedido o platillos)
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

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">📝 Toma de Pedidos</h1>
          <p className="page-subtitle">Gestión de comandas en mesa y domicilios</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className={`btn ${vista === 'lista' ? 'btn-primary' : 'btn-neutral'}`}
            onClick={() => setVista('lista')}
          >
            📋 Lista de Pedidos
          </button>
          {sesion?.tienePermiso('pedidos_crear') && (
            <button
              className={`btn ${vista === 'nuevo' ? 'btn-primary' : 'btn-success'}`}
              onClick={() => setVista('nuevo')}
            >
              ➕ Nuevo Pedido
            </button>
          )}
        </div>
      </div>

      {mensajeModal && (
        <div className={`toast toast--${mensajeModal.tipo === 'exito' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {mensajeModal.texto}
        </div>
      )}

      {/* VISTA 1: LISTA DE PEDIDOS */}
      {vista === 'lista' && (
        <div className="nm-card">
          {/* Barra de Filtros por Mesa y Buscador */}
          <div style={{ padding: '12px', marginBottom: '1rem', background: 'var(--bg-inset)', borderRadius: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                🔎 BUSCAR POR NOMBRE / CLIENTE / PLATILLO
              </label>
              <input
                type="text"
                className="form-input"
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                placeholder="Ej: Carlos, Mesa 2, Sopa, #10..."
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
                {mesasUnicas.map((m: string) => (
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

          {sesion?.usuario?.rol === 'mesero' && (
            <div style={{ padding: '6px 12px', marginBottom: '1rem', background: '#E3F2FD', borderLeft: '4px solid #2196F3', borderRadius: '4px', fontSize: '0.85rem', color: '#0D47A1', fontWeight: 600 }}>
              📅 Mostrando solo pedidos creados hoy ({new Date().toLocaleDateString('es-CO')})
            </div>
          )}

          <div className="tabs" style={{ marginBottom: '1rem' }}>
            {['todos', 'pendiente', 'preparacion', 'listo', 'en_camino', 'entregado'].map(st => (
              <button
                key={st}
                className={`tab-btn ${filtroEstado === st ? 'active' : ''}`}
                onClick={() => setFiltroEstado(st)}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: '200px' }} />
          ) : pedidosFiltrados.length === 0 ? (
            <div className="empty-state">
              <p>No hay pedidos en esta sección.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {pedidosFiltrados.map((p) => (
                <div key={p.id} className="nm-card" style={{ padding: '1rem', borderLeft: `5px solid var(--status-${p.estado === 'listo' ? 'ready' : p.estado === 'preparacion' ? 'prep' : 'pending'})` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>#{p.numero_pedido}</span>
                    <span className={`badge badge-${p.estado === 'listo' ? 'ready' : p.estado === 'preparacion' ? 'prep' : 'pending'}`}>
                      {p.estado}
                    </span>
                  </div>
                  <p style={{ margin: '0.25rem 0', fontWeight: 'bold' }}>
                    {p.tipo === 'mesa' ? `🪑 Mesa ${p.mesa?.numero || 'N/A'}` : `🛵 Domicilio - ${p.cliente?.nombre || p.cliente_nombre_rapido || 'Cliente'}`}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                    Pago: <span className={`badge badge-${p.estado_pago === 'pagado' ? 'success' : 'cancel'}`}>{p.estado_pago}</span>
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--orange-dark)' }}>
                      ${p.total.toLocaleString('es-CO')}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-sm btn-neutral" onClick={() => setSelectedPedido(p)}>
                        👁️ Ver
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => generarPDFRecibo(p)} title="Imprimir / PDF">
                        📄 Recibo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: NUEVO PEDIDO */}
      {vista === 'nuevo' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
          {/* PANEL IZQUIERDO: SELECCIÓN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Paso 1: Tipo y Mesa/Cliente */}
            <div className="nm-card">
              <h3 className="section-title">1. Tipo de Servicio y Datos</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  className={`btn ${tipo === 'mesa' ? 'btn-primary' : 'btn-neutral'}`}
                  onClick={() => setTipo('mesa')}
                >
                  🪑 Mesa / Comedor
                </button>
                <button
                  className={`btn ${tipo === 'domicilio' ? 'btn-primary' : 'btn-neutral'}`}
                  onClick={() => setTipo('domicilio')}
                >
                  🛵 Servicio a Domicilio
                </button>
              </div>

              {tipo === 'mesa' ? (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Seleccionar Mesa *</label>
                  <select className="form-select" value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
                    <option value="">-- Elige una mesa --</option>
                    {mesas.map((m) => (
                      <option key={m.id} value={m.id}>
                        Mesa {m.numero} {m.nombre ? `(${m.nombre})` : ''} - Cap: {m.capacidad} [{m.estado}]
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Datos del cliente (Aplica para Mesa y Domicilio) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                {sesion?.usuario?.rol !== 'mesero' && (
                  <div className="form-group">
                    <label className="form-label">Cliente Registrado (Opcional)</label>
                    <select className="form-select" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                      <option value="">-- Buscar / Seleccionar de la lista --</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({c.telefono}) - {c.barrio || 'Sin barrio'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!clienteId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Nombre del Cliente</label>
                        <input className="form-input" value={clienteNombreRapido} onChange={(e) => setClienteNombreRapido(e.target.value)} placeholder="Ej: María Pérez" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Teléfono / Celular</label>
                        <input className="form-input" value={clienteTelefonoRapido} onChange={(e) => setClienteTelefonoRapido(e.target.value)} placeholder="Ej: 3001234567" />
                      </div>
                    </div>

                    {clienteNombreRapido.trim() && clienteTelefonoRapido.trim() && (
                      <label className="nm-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={guardarDirectorio}
                          onChange={(e) => setGuardarDirectorio(e.target.checked)}
                        />
                        <span className="nm-checkbox-box" />
                        <span>☑️ Guardar como cliente registrado en el directorio</span>
                      </label>
                    )}
                  </div>
                )}

                {tipo === 'domicilio' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-raised)', padding: '0.75rem', borderRadius: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--orange-dark)' }}>🛵 Datos para la Entrega a Domicilio</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Dirección de Entrega *</label>
                        <input className="form-input" value={direccionEntrega} onChange={(e) => setDireccionEntrega(e.target.value)} placeholder="Ej: Calle 10 # 5-20, Apto 302" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Barrio / Sector</label>
                        <input className="form-input" value={barrioEntrega} onChange={(e) => setBarrioEntrega(e.target.value)} placeholder="Ej: Centro, El Poblado..." />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Indicaciones / Notas para el Domiciliario (Opcional)</label>
                      <input className="form-input" value={notasEntrega} onChange={(e) => setNotasEntrega(e.target.value)} placeholder="Ej: Timbre averiado, llamar al llegar" />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Asignar Domiciliario</label>
                      <select className="form-select" value={domiciliarioId} onChange={(e) => setDomiciliarioId(e.target.value)}>
                        <option value="">-- Seleccionar repartidor --</option>
                        {domiciliarios.map((d) => (
                          <option key={d.id} value={d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Paso 2: Menú del día (Pizarra) */}
            <div className="nm-card">
              <h3 className="section-title">2. Seleccionar Platos (Pizarra del Día)</h3>
              {pizarra.length === 0 ? (
                <p className="text-muted">No hay platos activados en la pizarra de hoy.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  {pizarra.map((item) => {
                    const disp = item.disponibles !== null ? item.disponibles - item.vendidos : null;
                    const agotado = disp !== null && disp <= 0;
                    return (
                      <div
                        key={item.id}
                        className={`nm-card ${agotado ? 'opacity-50' : ''}`}
                        style={{ padding: '0.75rem', cursor: agotado ? 'not-allowed' : 'pointer', border: '1px solid var(--bg-inset)' }}
                        onClick={() => !agotado && agregarAlCarrito(item)}
                      >
                        <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{item.plato?.emojis_ingredientes}</div>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{item.plato?.nombre}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--orange-dark)' }}>${item.precio_hoy.toLocaleString('es-CO')}</span>
                          {disp !== null && (
                            <span className={`badge ${agotado ? 'badge-cancel' : 'badge-info'}`}>
                              {agotado ? 'Agotado' : `Cupo: ${disp}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: CARRITO Y RESUMEN */}
          <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 className="section-title">🛒 Comanda</h3>
              {cart.length === 0 ? (
                <div className="empty-state">
                  <p>Toca platos a la izquierda para agregarlos.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto' }}>
                  {cart.map((item, idx) => (
                    <div key={idx} className="nm-inset" style={{ padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{item.nombre}</span>
                        <span>${(item.precio_unitario * item.cantidad).toLocaleString('es-CO')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => modificarCantidadCart(idx, -1)}>-</button>
                        <span>{item.cantidad}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => modificarCantidadCart(idx, 1)}>+</button>
                      </div>
                      <input
                        className="form-input"
                        style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        placeholder="Modificaciones / alergias..."
                        value={item.modificaciones}
                        onChange={(e) => modificarNotasCart(idx, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totales y Ajustes */}
            <div style={{ borderTop: '1px solid var(--bg-inset)', paddingTop: '1rem', marginTop: '1rem' }}>
              {/* Propina Voluntaria */}
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={propinaActiva} onChange={(e) => setPropinaActiva(e.target.checked)} />
                  <span>➕ Propina Voluntaria</span>
                </label>
                {propinaActiva && (
                  <input
                    type="number"
                    className="form-input"
                    style={{ marginTop: '0.25rem' }}
                    value={propinaValor}
                    onChange={(e) => setPropinaValor(Number(e.target.value))}
                    placeholder="Monto propina COP"
                  />
                )}
              </div>

              {/* Método de pago */}
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Estado de Pago</label>
                <select className="form-select" value={estadoPago} onChange={(e) => setEstadoPago(e.target.value as EstadoPago)}>
                  <option value="pendiente_pago">Pendiente de Pago</option>
                  <option value="pagado">Pagado Ahora</option>
                  <option value="fiado">Fiado</option>
                </select>
              </div>

              {/* Total final */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Total:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--orange-dark)' }}>
                  ${totalGeneral.toLocaleString('es-CO')}
                </span>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handleCrearPedido}
                disabled={saving || cart.length === 0}
              >
                {saving ? 'Procesando...' : '🚀 Enviar a Cocina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE PEDIDO */}
      {selectedPedido && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal__header">
              <h3>Pedido #{selectedPedido.numero_pedido}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPedido(null)}>❌</button>
            </div>
            <div className="modal__body">
              <p><strong>Tipo:</strong> {selectedPedido.tipo.toUpperCase()}</p>
              <p><strong>Estado:</strong> {selectedPedido.estado}</p>
              <p><strong>Pago:</strong> {selectedPedido.estado_pago}</p>
              <hr style={{ margin: '0.5rem 0', borderColor: 'var(--bg-inset)' }} />
              <h4>Detalle de items:</h4>
              {selectedPedido.detalle?.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>{d.cantidad}x {d.plato?.nombre || 'Plato'}</span>
                  <span>${d.subtotal.toLocaleString('es-CO')}</span>
                </div>
              ))}
              <hr style={{ margin: '0.5rem 0', borderColor: 'var(--bg-inset)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem' }}>
                <span>Total:</span>
                <span>${selectedPedido.total.toLocaleString('es-CO')}</span>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => generarPDFRecibo(selectedPedido)}>📄 Generar PDF</button>
              <button className="btn btn-primary" onClick={() => setSelectedPedido(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
