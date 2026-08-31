'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import { Cliente } from '@/lib/types';
import Link from 'next/link';

export default function ClientesPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEdit, setModalEdit] = useState<Cliente | null>(null);

  // Formulario cliente
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [barrio, setBarrio] = useState('');
  const [notasPreferencias, setNotasPreferencias] = useState('');
  const [notasEntrega, setNotasEntrega] = useState('');
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const isMesero = sesion?.usuario?.rol === 'mesero';
  const canSearch = !isMesero && sesion?.tienePermiso('clientes_buscar');
  const canEdit = !isMesero && sesion?.tienePermiso('clientes_editar');

  useEffect(() => {
    if (canSearch) {
      cargarClientes();
    }
  }, [canSearch]);

  if (isMesero || !canSearch) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <span className="empty-state__icon">🔒</span>
          <p className="empty-state__title">Acceso Denegado</p>
          <p className="empty-state__desc">El directorio completo de clientes está protegido y reservado a Administración y Caja.</p>
        </div>
      </main>
    );
  }

  const cargarClientes = async () => {
    setLoading(true);
    let query = supabase.from('clientes').select('*').order('nombre');
    if (busqueda.trim()) {
      query = query.or(`nombre.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`);
    }
    const { data } = await query;
    if (data) setClientes(data as Cliente[]);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    cargarClientes();
  };

  const resetForm = () => {
    setNombre('');
    setTelefono('');
    setDireccion('');
    setBarrio('');
    setNotasPreferencias('');
    setNotasEntrega('');
  };

  const guardarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !telefono) {
      setMensaje({ tipo: 'error', texto: 'Nombre y teléfono son obligatorios.' });
      return;
    }
    setSaving(true);

    const payload = {
      nombre,
      telefono,
      direccion: direccion || null,
      barrio: barrio || null,
      notas_preferencias: notasPreferencias || null,
      notas_entrega: notasEntrega || null
    };

    if (modalEdit) {
      const { error } = await supabase.from('clientes').update(payload).eq('id', modalEdit.id);
      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al actualizar cliente.' });
      } else {
        setMensaje({ tipo: 'exito', texto: 'Cliente actualizado exitosamente.' });
        setModalEdit(null);
        cargarClientes();
      }
    } else {
      const { error } = await supabase.from('clientes').insert(payload);
      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al registrar cliente.' });
      } else {
        setMensaje({ tipo: 'exito', texto: 'Cliente registrado con éxito.' });
        setModalNuevo(false);
        resetForm();
        cargarClientes();
      }
    }
    setSaving(false);
  };

  const abrirModalEditar = (c: Cliente) => {
    setModalEdit(c);
    setNombre(c.nombre);
    setTelefono(c.telefono);
    setDireccion(c.direccion || '');
    setBarrio(c.barrio || '');
    setNotasPreferencias(c.notas_preferencias || '');
    setNotasEntrega(c.notas_entrega || '');
  };

  if (!canSearch) {
    return (
      <div className="nm-card empty-state">
        <h2>🔒 Acceso Denegado</h2>
        <p>No tienes permiso para buscar o ver clientes.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">👤 Directorio de Clientes</h1>
          <p className="page-subtitle">CRM y registro de preferencias de comensales</p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setModalNuevo(true);
            }}
          >
            ➕ Nuevo Cliente
          </button>
        )}
      </div>

      {mensaje && (
        <div className={`toast toast--${mensaje.tipo === 'exito' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {mensaje.texto}
        </div>
      )}

      {/* Buscador */}
      <form onSubmit={handleSearch} className="nm-card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <input
          type="text"
          className="form-input"
          placeholder="🔍 Buscar cliente por nombre o teléfono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">Buscar</button>
      </form>

      {/* Lista / Grid */}
      {loading ? (
        <div className="skeleton" style={{ height: '200px' }} />
      ) : clientes.length === 0 ? (
        <div className="empty-state nm-card">
          <p>No se encontraron clientes.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {clientes.map((c) => (
            <div key={c.id} className="nm-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{c.nombre}</h3>
                  <span className="badge badge-info">{c.barrio || 'General'}</span>
                </div>
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }} className="text-muted">📞 {c.telefono}</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>📍 {c.direccion || 'Sin dirección'}</p>

                {c.notas_preferencias && (
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    ❤️ <strong>Pref:</strong> {c.notas_preferencias}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--bg-inset)', paddingTop: '0.75rem' }}>
                <Link href={`/clientes/${c.id}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
                  📊 Historial
                </Link>
                {c.telefono && (
                  <a
                    href={`https://wa.me/57${c.telefono.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-success"
                    style={{ textDecoration: 'none' }}
                  >
                    💬 WA
                  </a>
                )}
                {canEdit && (
                  <button className="btn btn-sm btn-ghost" onClick={() => abrirModalEditar(c)}>
                    ✏️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nuevo / Editar */}
      {(modalNuevo || modalEdit) && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={guardarCliente} style={{ maxWidth: '500px' }}>
            <div className="modal__header">
              <h3>{modalEdit ? '✏️ Editar Cliente' : '➕ Nuevo Cliente'}</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setModalNuevo(false); setModalEdit(null); }}>❌</button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Nombre Completo *</label>
                <input className="form-input" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Carlos Mendoza" />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono / WhatsApp *</label>
                <input className="form-input" required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 3001234567" />
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="form-input" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Cra 45 # 12 - 34" />
              </div>
              <div className="form-group">
                <label className="form-label">Barrio</label>
                <input className="form-input" value={barrio} onChange={(e) => setBarrio(e.target.value)} placeholder="Ej: Laureles" />
              </div>
              <div className="form-group">
                <label className="form-label">Notas de Preferencias (Comida, Alergias)</label>
                <textarea className="form-textarea" rows={2} value={notasPreferencias} onChange={(e) => setNotasPreferencias(e.target.value)} placeholder="Ej: Sin picante, le gusta la salsa criolla" />
              </div>
              <div className="form-group">
                <label className="form-label">Notas para el Domiciliario</label>
                <textarea className="form-textarea" rows={2} value={notasEntrega} onChange={(e) => setNotasEntrega(e.target.value)} placeholder="Ej: Timbre descompuesto, llamar al celular" />
              </div>
            </div>
            <div className="modal__footer">
              <button type="button" className="btn btn-neutral" onClick={() => { setModalNuevo(false); setModalEdit(null); }}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cliente'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
