'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { TurnoCaja, GastoCaja, Pedido, CategoriasGasto } from '@/lib/types';
import jsPDF from 'jspdf';

interface Denominaciones {
  b100k: number;
  b50k: number;
  b20k: number;
  b10k: number;
  b5k: number;
  b2k: number;
  b1k: number;
  m500: number;
  m100: number;
  m50: number;
}

export default function CajaPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [turnoActivo, setTurnoActivo] = useState<TurnoCaja | null>(null);
  const [pedidosTurno, setPedidosTurno] = useState<Pedido[]>([]);
  const [gastosTurno, setGastosTurno] = useState<GastoCaja[]>([]);
  const [historialTurnos, setHistorialTurnos] = useState<TurnoCaja[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario Abrir Turno
  const [baseInicial, setBaseInicial] = useState<number>(50000);
  const [saving, setSaving] = useState(false);

  // Formulario Registrar Gasto
  const [modalGasto, setModalGasto] = useState(false);
  const [descGasto, setDescGasto] = useState('');
  const [montoGasto, setMontoGasto] = useState<number | ''>('');
  const [catGasto, setCatGasto] = useState<CategoriasGasto>('insumos');

  // Modal Cierre de Caja / Arqueo
  const [modalCierre, setModalCierre] = useState(false);
  const [modoDesglose, setModoDesglose] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState<number | ''>('');
  const [notasCierre, setNotasCierre] = useState('');

  // Desglose de Billetes/Monedas
  const [denominaciones, setDenominaciones] = useState<Denominaciones>({
    b100k: 0,
    b50k: 0,
    b20k: 0,
    b10k: 0,
    b5k: 0,
    b2k: 0,
    b1k: 0,
    m500: 0,
    m100: 0,
    m50: 0,
  });

  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const hasAccess = sesion?.tienePermiso('caja');

  const calcularTotalDenominaciones = (d: Denominaciones) => {
    return (
      d.b100k * 100000 +
      d.b50k * 50000 +
      d.b20k * 20000 +
      d.b10k * 10000 +
      d.b5k * 5000 +
      d.b2k * 2000 +
      d.b1k * 1000 +
      d.m500 * 500 +
      d.m100 * 100 +
      d.m50 * 50
    );
  };

  const updateDenominacion = (key: keyof Denominaciones, val: number) => {
    const next = { ...denominaciones, [key]: Math.max(0, val) };
    setDenominaciones(next);
    setEfectivoContado(calcularTotalDenominaciones(next));
  };

  const cargarEstadoCaja = useCallback(async () => {
    setLoading(true);

    try {
      // 1. Turno activo (ordenamos por fecha_apertura descendente para obtener el más reciente si hay varios abiertos)
      const { data: listTurnos, error: errTurno } = await supabase
        .from('turnos_caja')
        .select('*')
        .eq('estado', 'abierto')
        .order('fecha_apertura', { ascending: false });

      if (errTurno) {
        console.error('[Caja] Error al consultar turno activo:', errTurno);
      }

      const dataTurno = listTurnos && listTurnos.length > 0 ? listTurnos[0] : null;

      if (dataTurno) {
        const active = dataTurno as TurnoCaja;

        // Cargar nombre del usuario de apertura
        if (active.abierto_por) {
          const { data: uData } = await supabase
            .from('usuarios')
            .select('id, nombre')
            .eq('id', active.abierto_por)
            .maybeSingle();
          if (uData) active.abierto_por_usuario = uData as any;
        }

        setTurnoActivo(active);

        // 2. Cargar pedidos realizados desde la fecha de apertura del turno
        const { data: dataPed } = await supabase
          .from('pedidos')
          .select('*')
          .gte('fecha_creacion', active.fecha_apertura)
          .not('estado', 'eq', 'cancelado');
        if (dataPed) setPedidosTurno(dataPed as Pedido[]);

        // 3. Cargar gastos de este turno
        const { data: dataGas } = await supabase
          .from('gastos_caja')
          .select('*')
          .eq('turno_id', active.id)
          .order('fecha', { ascending: false });
        if (dataGas) setGastosTurno(dataGas as GastoCaja[]);
      } else {
        setTurnoActivo(null);
        setPedidosTurno([]);
        setGastosTurno([]);
      }

      // 4. Cargar historial de turnos cerrados
      const { data: dataHist } = await supabase
        .from('turnos_caja')
        .select('*')
        .eq('estado', 'cerrado')
        .order('fecha_cierre', { ascending: false })
        .limit(20);

      if (dataHist) {
        const userIds = new Set<string>();
        dataHist.forEach((t) => {
          if (t.abierto_por) userIds.add(t.abierto_por);
          if (t.cerrado_por) userIds.add(t.cerrado_por);
        });

        const userMap: Record<string, { id: string; nombre: string }> = {};
        if (userIds.size > 0) {
          const { data: uList } = await supabase
            .from('usuarios')
            .select('id, nombre')
            .in('id', Array.from(userIds));
          if (uList) {
            uList.forEach((u) => {
              userMap[u.id] = u;
            });
          }
        }

        const formattedHist = dataHist.map((t) => ({
          ...t,
          abierto_por_usuario: t.abierto_por ? userMap[t.abierto_por] : undefined,
          cerrado_por_usuario: t.cerrado_por ? userMap[t.cerrado_por] : undefined,
        }));
        setHistorialTurnos(formattedHist as TurnoCaja[]);
      }
    } catch (err) {
      console.error('Error al cargar estado de caja:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (hasAccess) {
      cargarEstadoCaja();
    }
  }, [hasAccess, cargarEstadoCaja]);

  const abrirTurno = async () => {
    if (baseInicial < 0) return;
    setSaving(true);
    setMensaje(null);

    // 1. Verificar si ya existe un turno abierto
    const { data: existingTurnos } = await supabase
      .from('turnos_caja')
      .select('*')
      .eq('estado', 'abierto')
      .order('fecha_apertura', { ascending: false });

    if (existingTurnos && existingTurnos.length > 0) {
      setSaving(false);
      setMensaje({ tipo: 'exito', texto: '🎉 Conectado al turno de caja activo.' });
      setTurnoActivo(existingTurnos[0] as TurnoCaja);
      await cargarEstadoCaja();
      return;
    }

    const payload = {
      abierto_por: sesion?.usuario?.id || null,
      base_inicial: baseInicial,
      estado: 'abierto' as const,
      fecha_apertura: new Date().toISOString(),
    };

    let { data: newTurnos, error } = await supabase
      .from('turnos_caja')
      .insert(payload)
      .select();

    if (error && payload.abierto_por) {
      console.warn('Retry abrirTurno with abierto_por null due to RLS/FK constraint:', error);
      const retry = await supabase
        .from('turnos_caja')
        .insert({ ...payload, abierto_por: null })
        .select();
      newTurnos = retry.data;
      error = retry.error;
    }

    setSaving(false);

    if (error) {
      console.error('Error al abrir turno:', error);
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir el turno: ' + (error.message || 'Error de base de datos') });
    } else {
      setMensaje({ tipo: 'exito', texto: '🎉 Turno de caja abierto correctamente con base $' + baseInicial.toLocaleString('es-CO') });
      const created = newTurnos && newTurnos.length > 0 ? (newTurnos[0] as TurnoCaja) : null;
      if (created) {
        setTurnoActivo(created);
      }
      await cargarEstadoCaja();
    }
  };

  const guardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descGasto || !montoGasto || !turnoActivo) return;
    setSaving(true);

    const { error } = await supabase.from('gastos_caja').insert({
      turno_id: turnoActivo.id,
      descripcion: descGasto,
      monto: Number(montoGasto),
      categoria: catGasto,
      registrado_por: sesion?.usuario.id || null,
      fecha: new Date().toISOString(),
    });

    setSaving(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al registrar el gasto: ' + error.message });
    } else {
      setMensaje({ tipo: 'exito', texto: '💸 Gasto de $' + Number(montoGasto).toLocaleString('es-CO') + ' registrado correctamente.' });
      setModalGasto(false);
      setDescGasto('');
      setMontoGasto('');
      cargarEstadoCaja();
    }
  };

  // Métricas del turno activo
  const ventasEfectivo = pedidosTurno
    .filter((p) => p.estado_pago === 'pagado')
    .reduce((acc, p) => acc + (p.monto_efectivo || 0), 0);

  const ventasTransferencia = pedidosTurno
    .filter((p) => p.estado_pago === 'pagado')
    .reduce((acc, p) => acc + (p.monto_transferencia || 0), 0);

  const totalGastos = gastosTurno.reduce((acc, g) => acc + g.monto, 0);
  const totalVentas = ventasEfectivo + ventasTransferencia;
  const efectivoEsperadoEnCaja = (turnoActivo?.base_inicial || 0) + ventasEfectivo - totalGastos;

  const cerrarTurno = async () => {
    if (!turnoActivo || efectivoContado === '') return;

    const contado = Number(efectivoContado);
    const diferencia = contado - efectivoEsperadoEnCaja;
    setSaving(true);

    const updatePayload = {
      estado: 'cerrado' as const,
      fecha_cierre: new Date().toISOString(),
      cerrado_por: sesion?.usuario.id || null,
      total_efectivo_sistema: efectivoEsperadoEnCaja,
      total_efectivo_contado: contado,
      diferencia,
      total_transferencias: ventasTransferencia,
      total_gastos: totalGastos,
      total_ventas: totalVentas,
      notas_cierre: notasCierre || null,
    };

    const { error } = await supabase
      .from('turnos_caja')
      .update(updatePayload)
      .eq('id', turnoActivo.id);

    setSaving(false);

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al cerrar el turno: ' + error.message });
    } else {
      setMensaje({ tipo: 'exito', texto: '🔒 Turno de caja cerrado y arqueo guardado con éxito.' });

      // Generar ticket PDF del cierre inmediatamente
      const turnoCompleto: TurnoCaja = {
        ...turnoActivo,
        ...updatePayload,
        abierto_por_usuario: turnoActivo.abierto_por_usuario,
        cerrado_por_usuario: { id: sesion?.usuario?.id || '', nombre: sesion?.usuario?.nombre || 'Usuario' } as any,
      };
      generarPDFArqueo(turnoCompleto);

      setModalCierre(false);
      cargarEstadoCaja();
    }
  };

  // Generación de Ticket PDF de Cierre / Arqueo
  const generarPDFArqueo = (turno: TurnoCaja) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 220] });
    let y = 8;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('RESTAURANTE ÁARSTOVA', 40, y, { align: 'center' });
    y += 5;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('=== COMPROBANTE CIERRE DE CAJA ===', 40, y, { align: 'center' });
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha Apertura: ${new Date(turno.fecha_apertura).toLocaleString('es-CO')}`, 5, y);
    y += 4;
    doc.text(`Fecha Cierre: ${turno.fecha_cierre ? new Date(turno.fecha_cierre).toLocaleString('es-CO') : new Date().toLocaleString('es-CO')}`, 5, y);
    y += 4;
    doc.text(`Abierto por: ${turno.abierto_por_usuario?.nombre || 'Personal'}`, 5, y);
    y += 4;
    doc.text(`Cerrado por: ${turno.cerrado_por_usuario?.nombre || sesion?.usuario.nombre || 'Personal'}`, 5, y);
    y += 5;

    doc.text('------------------------------------------------', 5, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE ARQUEO DE CAJA', 5, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.text(`Base Inicial Efectivo:`, 5, y);
    doc.text(`$${(turno.base_inicial || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 4;

    doc.text(`(+) Ventas Efectivo:`, 5, y);
    doc.text(`$${((turno.total_ventas || 0) - (turno.total_transferencias || 0)).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 4;

    doc.text(`(+) Ventas Transferencia:`, 5, y);
    doc.text(`$${(turno.total_transferencias || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 4;

    doc.text(`(-) Gastos de Caja:`, 5, y);
    doc.text(`-$${(turno.total_gastos || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 4;

    doc.text('------------------------------------------------', 5, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL VENTAS BRUTAS:`, 5, y);
    doc.text(`$${(turno.total_ventas || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 5;

    doc.text(`Efectivo Sistema Esperado:`, 5, y);
    doc.text(`$${(turno.total_efectivo_sistema || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 4;

    doc.text(`Efectivo Físico Contado:`, 5, y);
    doc.text(`$${(turno.total_efectivo_contado || 0).toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 5;

    const dif = turno.diferencia || 0;
    doc.setFont('helvetica', 'bold');
    doc.text(`DIFERENCIA (CUADRE):`, 5, y);
    doc.text(`${dif >= 0 ? '+' : ''}$${dif.toLocaleString('es-CO')}`, 75, y, { align: 'right' });
    y += 6;

    if (turno.notas_cierre) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Notas / Observaciones: ${turno.notas_cierre}`, 5, y, { maxWidth: 70 });
      y += 8;
    }

    y += 10;
    doc.text('----------------------------------', 40, y, { align: 'center' });
    y += 4;
    doc.text('Firma Cajero / Responsable', 40, y, { align: 'center' });

    doc.save(`Cierre_Caja_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (!hasAccess) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permiso de acceso al módulo de Control de Caja y Arqueo.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title">💵 Control de Caja, Turnos y Arqueo</h1>
        <p className="page-subtitle">Gestión de aperturas, ventas en vivo, registro de egresos y cuadre de caja diario</p>
      </div>

      {mensaje && (
        <div className={`toast toast--${mensaje.tipo === 'exito' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {mensaje.texto}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: '260px' }} />
      ) : (
        <>
          {/* BANNER PRINCIPAL DE ESTADO */}
          <div
            className="nm-card"
            style={{
              background: turnoActivo ? 'var(--green-muted, #E8F5E9)' : 'var(--red-muted, #FFEBEE)',
              borderLeft: `6px solid ${turnoActivo ? 'var(--green, #4CAF50)' : 'var(--red, #F44336)'}`,
              padding: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge badge-${turnoActivo ? 'success' : 'cancel'}`} style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
                  {turnoActivo ? '🟢 CAJA ABIERTA' : '🔴 CAJA CERRADA'}
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                  {turnoActivo ? `Turno activo desde las ${new Date(turnoActivo.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No hay turno de caja activo en este momento'}
                </span>
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                {turnoActivo
                  ? `Responsable: ${turnoActivo.abierto_por_usuario?.nombre || 'Usuario'} | Base inicial: $${turnoActivo.base_inicial.toLocaleString('es-CO')}`
                  : 'Ingresa la base inicial para abrir la caja y comenzar a registrar ventas del turno.'}
              </p>
            </div>

            {turnoActivo && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-neutral" onClick={() => setModalGasto(true)}>
                  💸 Registrar Gasto
                </button>
                <button className="btn btn-danger" onClick={() => { setEfectivoContado(''); setModalCierre(true); }}>
                  🔒 Cerrar Turno / Arqueo
                </button>
              </div>
            )}
          </div>

          {!turnoActivo ? (
            /* MODULO ABRIR TURNO */
            <div className="nm-card" style={{ maxWidth: '520px', margin: '1.5rem auto', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔑</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Apertura de Turno de Caja</h2>
              <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Define la base en efectivo con la que inicia la caja registradora el día de hoy para habilitar el cuadre al cierre.
              </p>

              <div className="form-group" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                <label className="form-label">Base Inicial en Efectivo (COP) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={baseInicial}
                  onChange={(e) => setBaseInicial(Number(e.target.value))}
                  placeholder="Ej: 50000"
                  style={{ fontSize: '1.2rem', padding: '0.75rem' }}
                />
              </div>

              <button className="btn btn-primary btn-full" onClick={abrirTurno} disabled={saving} style={{ padding: '0.85rem', fontSize: '1.05rem', fontWeight: 800 }}>
                {saving ? 'Abriendo Turno...' : '🚀 Iniciar Operación de Caja'}
              </button>
            </div>
          ) : (
            /* METRICAS Y DETALLES DEL TURNO ACTIVO */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>Base Inicial</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>${turnoActivo.base_inicial.toLocaleString('es-CO')}</div>
                </div>

                <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ventas Efectivo</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--status-ready)' }}>
                    +${ventasEfectivo.toLocaleString('es-CO')}
                  </div>
                </div>

                <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ventas Transferencia</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--status-prep)' }}>
                    +${ventasTransferencia.toLocaleString('es-CO')}
                  </div>
                </div>

                <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>Gastos de Caja</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--status-cancel)' }}>
                    -${totalGastos.toLocaleString('es-CO')}
                  </div>
                </div>

                <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center', border: '2px solid var(--orange-dark)', background: 'var(--bg-raised)' }}>
                  <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 800 }}>Efectivo Esperado en Caja</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--orange-dark)' }}>
                    ${efectivoEsperadoEnCaja.toLocaleString('es-CO')}
                  </div>
                </div>
              </div>

              {/* TABLA DE GASTOS */}
              <div className="nm-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 className="section-title" style={{ margin: 0 }}>💸 Gastos Registrados en el Turno ({gastosTurno.length})</h3>
                  <button className="btn btn-sm btn-neutral" onClick={() => setModalGasto(true)}>+ Añadir Gasto</button>
                </div>
                {gastosTurno.length === 0 ? (
                  <p className="text-muted">No se han registrado gastos ni egresos en este turno.</p>
                ) : (
                  <table className="nm-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosTurno.map((g) => (
                        <tr key={g.id}>
                          <td>{new Date(g.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ fontWeight: 600 }}>{g.descripcion}</td>
                          <td><span className="badge badge-info">{g.categoria}</span></td>
                          <td style={{ fontWeight: 800, color: 'var(--status-cancel)' }}>
                            -${g.monto.toLocaleString('es-CO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* HISTORIAL DE TURNOS ANTERIORES */}
      <div className="nm-card" style={{ marginTop: '2rem' }}>
        <h3 className="section-title">📜 Historial de Turnos Cerrados & Arqueos</h3>
        {historialTurnos.length === 0 ? (
          <p className="text-muted">No hay historial de turnos cerrados aún.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="nm-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Responsables</th>
                  <th>Ventas Totales</th>
                  <th>Efectivo Sistema</th>
                  <th>Efectivo Contado</th>
                  <th>Diferencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {historialTurnos.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.fecha_apertura).toLocaleDateString()} {new Date(t.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      👤 {t.abierto_por_usuario?.nombre || 'Usuario'}
                    </td>
                    <td><strong>${(t.total_ventas || 0).toLocaleString('es-CO')}</strong></td>
                    <td>${(t.total_efectivo_sistema || 0).toLocaleString('es-CO')}</td>
                    <td>${(t.total_efectivo_contado || 0).toLocaleString('es-CO')}</td>
                    <td style={{ fontWeight: 800, color: (t.diferencia || 0) < 0 ? 'var(--status-cancel)' : 'var(--status-ready)' }}>
                      {(t.diferencia || 0) >= 0 ? '+' : ''}${(t.diferencia || 0).toLocaleString('es-CO')}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => generarPDFArqueo(t)}
                        title="Reimprimir Ticket de Arqueo PDF"
                      >
                        📄 Ticket PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR GASTO */}
      {modalGasto && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={guardarGasto} style={{ maxWidth: '420px' }}>
            <div className="modal__header">
              <h3>💸 Registrar Gasto / Salida de Caja</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModalGasto(false)}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label">Descripción del Gasto *</label>
                <input className="form-input" required value={descGasto} onChange={(e) => setDescGasto(e.target.value)} placeholder="Ej: Compra de hielo urgencia" />
              </div>
              <div className="form-group">
                <label className="form-label">Monto en Efectivo (COP) *</label>
                <input type="number" className="form-input" required value={montoGasto} onChange={(e) => setMontoGasto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Ej: 15000" />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={catGasto} onChange={(e) => setCatGasto(e.target.value as CategoriasGasto)}>
                  <option value="insumos">Insumos urgentes</option>
                  <option value="empaque">Empaques</option>
                  <option value="servicios">Servicios / Facturas</option>
                  <option value="personal">Personal / Avances</option>
                  <option value="mantenimiento">Mantenimiento</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="modal__footer">
              <button type="button" className="btn btn-neutral" onClick={() => setModalGasto(false)}>Cancelar</button>
              <button type="submit" className="btn btn-danger" disabled={saving}>
                {saving ? 'Registrando...' : 'Confirmar Gasto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CIERRE DE CAJA Y ARQUEO */}
      {modalCierre && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal__header">
              <h3>🔒 Arqueo y Cierre de Caja</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalCierre(false)}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>¿Cómo deseas contar el efectivo?</span>
                <button
                  type="button"
                  className="btn btn-sm btn-neutral"
                  onClick={() => setModoDesglose(!modoDesglose)}
                >
                  {modoDesglose ? '🔢 Modo Directo' : '🧮 Contador de Billetes'}
                </button>
              </div>

              {!modoDesglose ? (
                <div className="form-group">
                  <label className="form-label">Efectivo Físico Contado en Cajón (COP) *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={efectivoContado}
                    onChange={(e) => setEfectivoContado(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej: 235000"
                    style={{ fontSize: '1.2rem', padding: '0.75rem' }}
                  />
                </div>
              ) : (
                <div className="nm-inset" style={{ padding: '0.85rem', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div>
                    <label>$100,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b100k || ''} onChange={(e) => updateDenominacion('b100k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$50,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b50k || ''} onChange={(e) => updateDenominacion('b50k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$20,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b20k || ''} onChange={(e) => updateDenominacion('b20k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$10,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b10k || ''} onChange={(e) => updateDenominacion('b10k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$5,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b5k || ''} onChange={(e) => updateDenominacion('b5k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$2,000:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b2k || ''} onChange={(e) => updateDenominacion('b2k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>$1,000 / Monedas:</label>
                    <input type="number" min="0" className="form-input" value={denominaciones.b1k || ''} onChange={(e) => updateDenominacion('b1k', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>Total Contado:</label>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--orange-dark)', marginTop: '4px' }}>
                      ${(efectivoContado || 0).toLocaleString('es-CO')}
                    </div>
                  </div>
                </div>
              )}

              {efectivoContado !== '' && (
                <div style={{ padding: '0.85rem', borderRadius: '8px', background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>Efectivo Sistema (Esperado):</span>
                    <span style={{ fontWeight: 700 }}>${efectivoEsperadoEnCaja.toLocaleString('es-CO')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontWeight: 800, fontSize: '1rem' }}>
                    <span>Diferencia (Cuadre):</span>
                    <span style={{ color: (Number(efectivoContado) - efectivoEsperadoEnCaja) < 0 ? 'var(--status-cancel)' : 'var(--status-ready)' }}>
                      {(Number(efectivoContado) - efectivoEsperadoEnCaja) >= 0 ? '+' : ''}
                      ${(Number(efectivoContado) - efectivoEsperadoEnCaja).toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Observaciones o Justificación de Cierre</label>
                <textarea className="form-textarea" rows={2} value={notasCierre} onChange={(e) => setNotasCierre(e.target.value)} placeholder="Ej: Faltan $1,000 por cambio mal entregado." />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalCierre(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={cerrarTurno} disabled={efectivoContado === '' || saving}>
                {saving ? 'Cerrando...' : '🔒 Confirmar Cierre & Descargar Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
