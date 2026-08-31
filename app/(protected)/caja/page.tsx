'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { TurnoCaja, GastoCaja, Pedido, CategoriasGasto } from '@/lib/types';

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

  // Formulario Registrar Gasto
  const [modalGasto, setModalGasto] = useState(false);
  const [descGasto, setDescGasto] = useState('');
  const [montoGasto, setMontoGasto] = useState<number | ''>('');
  const [catGasto, setCatGasto] = useState<CategoriasGasto>('insumos');

  // Modal Cierre de Caja / Arqueo
  const [modalCierre, setModalCierre] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState<number | ''>('');
  const [notasCierre, setNotasCierre] = useState('');

  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const hasAccess = sesion?.tienePermiso('caja');

  useEffect(() => {
    if (hasAccess) {
      cargarEstadoCaja();
    }
  }, [sesion]);

  const cargarEstadoCaja = async () => {
    setLoading(true);

    // Turno activo
    const { data: dataTurno } = await supabase
      .from('turnos_caja')
      .select('*, abierto_por_usuario:usuarios(id, nombre)')
      .eq('estado', 'abierto')
      .maybeSingle();

    if (dataTurno) {
      const active = dataTurno as TurnoCaja;
      setTurnoActivo(active);

      // Cargar pedidos de este turno
      const { data: dataPed } = await supabase
        .from('pedidos')
        .select('*')
        .eq('turno_id', active.id);
      if (dataPed) setPedidosTurno(dataPed as Pedido[]);

      // Cargar gastos de este turno
      const { data: dataGas } = await supabase
        .from('gastos_caja')
        .select('*')
        .eq('turno_id', active.id)
        .order('fecha', { ascending: false });
      if (dataGas) setGastosTurno(dataGas as GastoCaja[]);
    } else {
      setTurnoActivo(null);
    }

    // Cargar historial de turnos cerrados
    const { data: dataHist } = await supabase
      .from('turnos_caja')
      .select('*, abierto_por_usuario:usuarios(id, nombre)')
      .eq('estado', 'cerrado')
      .order('fecha_cierre', { ascending: false })
      .limit(10);
    if (dataHist) setHistorialTurnos(dataHist as TurnoCaja[]);

    setLoading(false);
  };

  const abrirTurno = async () => {
    if (baseInicial < 0) return;
    const { error } = await supabase.from('turnos_caja').insert({
      abierto_por: sesion?.usuario.id || null,
      base_inicial: baseInicial,
      estado: 'abierto',
      fecha_apertura: new Date().toISOString()
    });

    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir el turno.' });
    } else {
      setMensaje({ tipo: 'exito', texto: 'Turno de caja abierto con éxito.' });
      cargarEstadoCaja();
    }
  };

  const guardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descGasto || !montoGasto || !turnoActivo) return;

    const { error } = await supabase.from('gastos_caja').insert({
      turno_id: turnoActivo.id,
      descripcion: descGasto,
      monto: Number(montoGasto),
      categoria: catGasto,
      registrado_por: sesion?.usuario.id || null,
      fecha: new Date().toISOString()
    });

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al registrar el gasto.' });
    } else {
      setMensaje({ tipo: 'exito', texto: 'Gasto registrado correctamente.' });
      setModalGasto(false);
      setDescGasto('');
      setMontoGasto('');
      cargarEstadoCaja();
    }
  };

  // Cálculos del turno
  const ventasEfectivo = pedidosTurno
    .filter(p => p.estado_pago === 'pagado')
    .reduce((acc, p) => acc + (p.monto_efectivo || 0), 0);

  const ventasTransferencia = pedidosTurno
    .filter(p => p.estado_pago === 'pagado')
    .reduce((acc, p) => acc + (p.monto_transferencia || 0), 0);

  const totalGastos = gastosTurno.reduce((acc, g) => acc + g.monto, 0);

  const efectivoEsperadoEnCaja = (turnoActivo?.base_inicial || 0) + ventasEfectivo - totalGastos;
  const totalVentas = ventasEfectivo + ventasTransferencia;

  const cerrarTurno = async () => {
    if (!turnoActivo || efectivoContado === '') return;

    const contado = Number(efectivoContado);
    const diferencia = contado - efectivoEsperadoEnCaja;

    const { error } = await supabase
      .from('turnos_caja')
      .update({
        estado: 'cerrado',
        fecha_cierre: new Date().toISOString(),
        cerrado_por: sesion?.usuario.id || null,
        total_efectivo_sistema: efectivoEsperadoEnCaja,
        total_efectivo_contado: contado,
        diferencia,
        total_transferencias: ventasTransferencia,
        total_gastos: totalGastos,
        total_ventas: totalVentas,
        notas_cierre: notasCierre || null
      })
      .eq('id', turnoActivo.id);

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al cerrar el turno.' });
    } else {
      setMensaje({ tipo: 'exito', texto: 'Turno de caja cerrado y arqueo guardado.' });
      setModalCierre(false);
      cargarEstadoCaja();
    }
  };

  if (!hasAccess) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permiso de acceso a Caja y Arqueo.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">💵 Control de Caja y Arqueo</h1>
        <p className="page-subtitle">Apertura, cuadre diario, gastos e historial de turnos</p>
      </div>

      {mensaje && (
        <div className={`toast toast--${mensaje.tipo === 'exito' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {mensaje.texto}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: '250px' }} />
      ) : !turnoActivo ? (
        /* ABRIR TURNO */
        <div className="nm-card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>🚪 Turno de Caja Cerrado</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
            Ingresa la base inicial de dinero en efectivo para comenzar las operaciones del turno.
          </p>

          <div className="form-group" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label className="form-label">Base Inicial en Efectivo (COP)</label>
            <input
              type="number"
              className="form-input"
              value={baseInicial}
              onChange={(e) => setBaseInicial(Number(e.target.value))}
              placeholder="Ej: 50000"
            />
          </div>

          <button className="btn btn-primary btn-full" onClick={abrirTurno}>
            🔑 Abrir Turno de Caja
          </button>
        </div>
      ) : (
        /* TURNO ACTIVO */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header del Turno */}
          <div className="nm-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="badge badge-success">🟢 TURNO ABIERTO</span>
              <p style={{ margin: '0.25rem 0 0 0', fontWeight: 'bold' }}>
                Abierto por: {turnoActivo.abierto_por_usuario?.nombre || 'Usuario'} | {new Date(turnoActivo.fecha_apertura).toLocaleTimeString()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-neutral" onClick={() => setModalGasto(true)}>
                💸 Registrar Gasto
              </button>
              <button className="btn btn-danger" onClick={() => setModalCierre(true)}>
                🔒 Cerrar Turno / Arqueo
              </button>
            </div>
          </div>

          {/* Tarjetas de Métricas en Tiempo Real */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Base Inicial</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>${turnoActivo.base_inicial.toLocaleString('es-CO')}</div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ventas Efectivo</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--status-ready)' }}>
                +${ventasEfectivo.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ventas Transferencia</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--status-prep)' }}>
                +${ventasTransferencia.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Gastos del Turno</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--status-cancel)' }}>
                -${totalGastos.toLocaleString('es-CO')}
              </div>
            </div>
            <div className="nm-card" style={{ padding: '1.25rem', textAlign: 'center', border: '2px solid var(--orange)' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Efectivo Esperado en Caja</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--orange-dark)' }}>
                ${efectivoEsperadoEnCaja.toLocaleString('es-CO')}
              </div>
            </div>
          </div>

          {/* Gastos del Turno */}
          <div className="nm-card">
            <h3 className="section-title">💸 Gastos Registrados en el Turno</h3>
            {gastosTurno.length === 0 ? (
              <p className="text-muted">No se han registrado gastos en este turno.</p>
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
                      <td>{g.descripcion}</td>
                      <td><span className="badge badge-info">{g.categoria}</span></td>
                      <td style={{ fontWeight: 'bold', color: 'var(--status-cancel)' }}>
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

      {/* Historial de Turnos Cerrados */}
      <div className="nm-card" style={{ marginTop: '2rem' }}>
        <h3 className="section-title">📜 Historial de Turnos Anteriores</h3>
        {historialTurnos.length === 0 ? (
          <p className="text-muted">No hay historial de turnos cerrados aún.</p>
        ) : (
          <table className="nm-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Ventas Totales</th>
                <th>Efectivo Sistema</th>
                <th>Efectivo Contado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {historialTurnos.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.fecha_apertura).toLocaleDateString()} {new Date(t.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td><strong>${(t.total_ventas || 0).toLocaleString('es-CO')}</strong></td>
                  <td>${(t.total_efectivo_sistema || 0).toLocaleString('es-CO')}</td>
                  <td>${(t.total_efectivo_contado || 0).toLocaleString('es-CO')}</td>
                  <td style={{ fontWeight: 'bold', color: (t.diferencia || 0) < 0 ? 'var(--status-cancel)' : 'var(--status-ready)' }}>
                    ${(t.diferencia || 0).toLocaleString('es-CO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Registrar Gasto */}
      {modalGasto && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={guardarGasto} style={{ maxWidth: '400px' }}>
            <div className="modal__header">
              <h3>💸 Registrar Gasto de Caja</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModalGasto(false)}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Descripción del Gasto *</label>
                <input className="form-input" required value={descGasto} onChange={(e) => setDescGasto(e.target.value)} placeholder="Ej: Compra de hielo emergencia" />
              </div>
              <div className="form-group">
                <label className="form-label">Monto (COP) *</label>
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
              <button type="submit" className="btn btn-danger">Registrar Gasto</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Arqueo Ciego y Cierre */}
      {modalCierre && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal__header">
              <h3>🔒 Arqueo Ciego y Cierre de Caja</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setModalCierre(false)}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="nm-inset" style={{ padding: '1rem', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  Cuenta físicamente el dinero en efectivo del cajón e ingresa el monto total a continuación.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Efectivo Físico Contado (COP) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={efectivoContado}
                  onChange={(e) => setEfectivoContado(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej: 235000"
                />
              </div>

              {efectivoContado !== '' && (
                <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-inset)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Efectivo Sistema:</span>
                    <span>${efectivoEsperadoEnCaja.toLocaleString('es-CO')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontWeight: 'bold' }}>
                    <span>Diferencia:</span>
                    <span style={{ color: (Number(efectivoContado) - efectivoEsperadoEnCaja) < 0 ? 'var(--status-cancel)' : 'var(--status-ready)' }}>
                      ${(Number(efectivoContado) - efectivoEsperadoEnCaja).toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Notas o Justificación de Cierre</label>
                <textarea className="form-textarea" rows={2} value={notasCierre} onChange={(e) => setNotasCierre(e.target.value)} placeholder="Ej: Faltan $2,000 por cambio mal dado." />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn-neutral" onClick={() => setModalCierre(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={cerrarTurno} disabled={efectivoContado === ''}>
                Confirmar y Cerrar Turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
