'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { ItemCompra, CategoriaCompra, UnidadCompra } from '@/lib/types';

export default function ComprasPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [items, setItems] = useState<ItemCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTab, setFiltroTab] = useState<'pendientes' | 'completados' | 'urgentes' | 'todos'>('pendientes');

  // Formulario nuevo item
  const [modalNuevo, setModalNuevo] = useState(false);
  const [insumo, setInsumo] = useState('');
  const [cantidad, setCantidad] = useState<number | ''>('');
  const [unidad, setUnidad] = useState<UnidadCompra>('kg');
  const [categoria, setCategoria] = useState<CategoriaCompra>('frutas_verduras');
  const [urgente, setUrgente] = useState(false);
  const [saving, setSaving] = useState(false);

  const canView = sesion?.tienePermiso('compras_ver');
  const canEdit = sesion?.tienePermiso('compras_editar');

  useEffect(() => {
    if (canView) {
      cargarCompras();
    }
  }, [sesion]);

  const cargarCompras = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('lista_compras')
      .select('*, registrado_por_usuario:usuarios(id, nombre)')
      .order('urgente', { ascending: false })
      .order('fecha_registro', { ascending: false });

    if (data) setItems(data as ItemCompra[]);
    setLoading(false);
  };

  const toggleCompletado = async (item: ItemCompra) => {
    if (!canEdit) return;
    const nuevoEstado = !item.completado;
    const { error } = await supabase
      .from('lista_compras')
      .update({
        completado: nuevoEstado,
        fecha_completado: nuevoEstado ? new Date().toISOString() : null
      })
      .eq('id', item.id);

    if (!error) cargarCompras();
  };

  const eliminarItem = async (id: string) => {
    if (!canEdit) return;
    const { error } = await supabase.from('lista_compras').delete().eq('id', id);
    if (!error) cargarCompras();
  };

  const agregarItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumo.trim()) return;
    setSaving(true);

    const { error } = await supabase.from('lista_compras').insert({
      insumo: insumo.trim(),
      cantidad: cantidad !== '' ? Number(cantidad) : null,
      unidad,
      categoria,
      urgente,
      registrado_por: sesion?.usuario.id || null
    });

    if (!error) {
      setInsumo('');
      setCantidad('');
      setUrgente(false);
      setModalNuevo(false);
      cargarCompras();
    }
    setSaving(false);
  };

  const exportarWhatsApp = () => {
    const pendientes = items.filter(i => !i.completado);
    if (pendientes.length === 0) return;

    let texto = `🛒 *LISTA DE COMPRAS ÁARSTOVA*\n----------------------------------\n`;
    pendientes.forEach(i => {
      const urg = i.urgente ? ' 🔴 *URGENTE*' : '';
      const cant = i.cantidad ? `${i.cantidad} ${i.unidad}` : '';
      texto += `• ${i.insumo} ${cant}${urg}\n`;
    });

    const link = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(link, '_blank');
  };

  if (!canView) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permiso para ver la lista de compras.</p>
      </div>
    );
  }

  const itemsFiltrados = items.filter(i => {
    if (filtroTab === 'pendientes') return !i.completado;
    if (filtroTab === 'completados') return i.completado;
    if (filtroTab === 'urgentes') return i.urgente && !i.completado;
    return true;
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">🛒 Lista de Compras y Faltantes</h1>
          <p className="page-subtitle">Control de insumos requeridos para la cocina</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-success" onClick={exportarWhatsApp}>
            💬 Exportar a WhatsApp
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setModalNuevo(true)}>
              ➕ Agregar Insumo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button className={`tab-btn ${filtroTab === 'pendientes' ? 'active' : ''}`} onClick={() => setFiltroTab('pendientes')}>
          ⏳ Pendientes ({items.filter(i => !i.completado).length})
        </button>
        <button className={`tab-btn ${filtroTab === 'urgentes' ? 'active' : ''}`} onClick={() => setFiltroTab('urgentes')}>
          🔥 Urgentes ({items.filter(i => i.urgente && !i.completado).length})
        </button>
        <button className={`tab-btn ${filtroTab === 'completados' ? 'active' : ''}`} onClick={() => setFiltroTab('completados')}>
          ✅ Completados ({items.filter(i => i.completado).length})
        </button>
        <button className={`tab-btn ${filtroTab === 'todos' ? 'active' : ''}`} onClick={() => setFiltroTab('todos')}>
          📁 Todos
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="skeleton" style={{ height: '200px' }} />
      ) : itemsFiltrados.length === 0 ? (
        <div className="empty-state nm-card">
          <p>No hay insumos registrados en esta lista.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {itemsFiltrados.map((item) => (
            <div
              key={item.id}
              className={`nm-card ${item.completado ? 'opacity-60' : ''}`}
              style={{
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderLeft: item.urgente ? '5px solid var(--status-cancel)' : '1px solid var(--bg-inset)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="checkbox"
                  checked={item.completado}
                  onChange={() => toggleCompletado(item)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <div>
                  <strong style={{ fontSize: '1.05rem', textDecoration: item.completado ? 'line-through' : 'none' }}>
                    {item.insumo}
                  </strong>
                  {item.cantidad && (
                    <span style={{ marginLeft: '0.75rem', fontWeight: 'bold', color: 'var(--orange-dark)' }}>
                      {item.cantidad} {item.unidad}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span className="badge badge-info">{item.categoria.replace('_', ' ')}</span>
                    {item.urgente && <span className="badge badge-cancel">🔴 URGENTE</span>}
                    {item.registrado_por_usuario && (
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                        Por: {item.registrado_por_usuario.nombre}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {canEdit && (
                <button className="btn btn-sm btn-ghost" onClick={() => eliminarItem(item.id)}>
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Agregar Insumo */}
      {modalNuevo && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={agregarItem} style={{ maxWidth: '450px' }}>
            <div className="modal__header">
              <h3>➕ Agregar Insumo a la Lista</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModalNuevo(false)}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Insumo / Producto *</label>
                <input className="form-input" required value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="Ej: Tomate chonto" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Cantidad</label>
                  <input type="number" step="any" className="form-input" value={cantidad} onChange={(e) => setCantidad(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Ej: 5" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unidad</label>
                  <select className="form-select" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadCompra)}>
                    <option value="kg">kg</option>
                    <option value="gramos">gramos</option>
                    <option value="litros">litros</option>
                    <option value="ml">ml</option>
                    <option value="unidades">unidades</option>
                    <option value="bolsas">bolsas</option>
                    <option value="cajas">cajas</option>
                    <option value="otro">otro</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCompra)}>
                  <option value="frutas_verduras">Frutas y Verduras</option>
                  <option value="carnes">Carnes / Proteínas</option>
                  <option value="bebidas">Bebidas</option>
                  <option value="empaque">Empaques</option>
                  <option value="limpieza">Limpieza / Aseo</option>
                  <option value="condimentos">Condimentos / Especias</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="urg" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
                <label htmlFor="urg" style={{ cursor: 'pointer', fontWeight: 'bold', color: 'var(--status-cancel)' }}>
                  🔴 Marcar como URGENTE
                </label>
              </div>
            </div>
            <div className="modal__footer">
              <button type="button" className="btn btn-neutral" onClick={() => setModalNuevo(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Agregar a Lista'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
