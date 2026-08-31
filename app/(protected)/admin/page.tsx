'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type {
  Usuario,
  Permisos,
  Rol,
  RestauranteConfig,
  CuentaBancaria,
  ZonaDomicilio,
  Mesa,
} from '@/lib/types';

// ─── Permiso labels ──────────────────────────────────────────
const PERMISO_LABELS: Record<keyof Permisos, string> = {
  menu_ver:            'Ver menú del día',
  menu_editar:         'Editar pizarra y banco de platos',
  menu_whatsapp:       'Generar mensaje WhatsApp del menú',
  pedidos_crear:       'Crear pedidos',
  pedidos_ver_propios: 'Ver sus propios pedidos',
  pedidos_ver_todos:   'Ver todos los pedidos',
  kds_ver:             'Ver pantalla de cocina (KDS)',
  domicilios_propios:  'Ver sus domicilios asignados',
  domicilios_todos:    'Ver todos los domicilios',
  clientes_buscar:     'Buscar clientes',
  clientes_editar:     'Crear y editar clientes',
  compras_ver:         'Ver lista de compras',
  compras_editar:      'Agregar a lista de compras',
  caja:                'Acceso a caja y arqueo',
  reportes:            'Ver reportes y estadísticas',
  admin:               'Administración del sistema',
};

const ALL_PERMISOS = Object.keys(PERMISO_LABELS) as (keyof Permisos)[];

const ROL_BADGE: Record<Rol, string> = {
  admin:        'badge-orange',
  chef:         'badge-ready',
  mesero:       'badge-prep',
  domiciliario: 'badge-transit',
};

const ROL_LABELS: Record<Rol, string> = {
  admin:        'Admin',
  chef:         'Chef',
  mesero:       'Mesero',
  domiciliario: 'Domiciliario',
};

// ─── Toast helper ─────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'default';
interface ToastMsg { id: number; msg: string; type: ToastType; }

let toastCounter = 0;

// ─── Initials helper ─────────────────────────────────────────
function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Toggle Component ─────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <label className="toggle-wrap" htmlFor={id}>
      <span className="toggle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" />
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function AdminPage() {
  const sesion = useSesion();
  const supabase = createClient();

  const [tab, setTab] = useState<'usuarios' | 'config' | 'mesas'>('usuarios');
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  function showToast(msg: string, type: ToastType = 'default') {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  // ── Access guard ──
  if (!sesion) {
    return (
      <div className="main-content">
        <div className="nm-card" style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: 80, borderRadius: 'var(--border-radius-lg)' }} />
        </div>
      </div>
    );
  }

  if (!sesion.permisos.admin) {
    return (
      <div className="main-content">
        <div className="nm-card" style={{ marginTop: 'var(--space-8)', maxWidth: 480, margin: 'var(--space-8) auto', textAlign: 'center' }}>
          <div className="empty-state">
            <span className="empty-state__icon">🔒</span>
            <p className="empty-state__title">Acceso denegado</p>
            <p className="empty-state__desc">No tienes permiso para acceder a la administración del sistema.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <h1>⚙️ Administración</h1>
          <span className="page-subtitle">Gestión completa del sistema Áarstova</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
        <button
          className={`tab-btn ${tab === 'usuarios' ? 'active' : ''}`}
          onClick={() => setTab('usuarios')}
        >
          👥 Usuarios
        </button>
        <button
          className={`tab-btn ${tab === 'config' ? 'active' : ''}`}
          onClick={() => setTab('config')}
        >
          🏪 Restaurante
        </button>
        <button
          className={`tab-btn ${tab === 'mesas' ? 'active' : ''}`}
          onClick={() => setTab('mesas')}
        >
          🪑 Mesas
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'usuarios' && (
        <TabUsuarios supabase={supabase} showToast={showToast} />
      )}
      {tab === 'config' && (
        <TabConfig supabase={supabase} showToast={showToast} />
      )}
      {tab === 'mesas' && (
        <TabMesas supabase={supabase} showToast={showToast} />
      )}

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type === 'success' ? 'toast--success' : t.type === 'error' ? 'toast--error' : t.type === 'warning' ? 'toast--warning' : ''}`}
          >
            <span>
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 1: USUARIOS
// ============================================================
function TabUsuarios({
  supabase,
  showToast,
}: {
  supabase: ReturnType<typeof createClient>;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos');

  // Modal states
  const [modalEditar, setModalEditar] = useState<Usuario | null>(null);
  const [modalPermisos, setModalPermisos] = useState<Usuario | null>(null);
  const [modalInvitar, setModalInvitar] = useState(false);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) showToast('Error al cargar usuarios: ' + error.message, 'error');
    else setUsuarios((data as Usuario[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  const usuariosFiltrados = usuarios.filter((u) => {
    if (filtroActivo === 'activos') return u.activo;
    if (filtroActivo === 'inactivos') return !u.activo;
    return true;
  });

  async function toggleActivo(u: Usuario) {
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: !u.activo })
      .eq('id', u.id);
    if (error) showToast('Error al actualizar: ' + error.message, 'error');
    else {
      showToast(`Usuario ${!u.activo ? 'activado' : 'desactivado'}`, 'success');
      fetchUsuarios();
    }
  }

  return (
    <div className="animate-fadeIn">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Gestión de Usuarios</h2>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {/* Filter */}
          <div className="tabs" style={{ padding: 3 }}>
            {(['todos', 'activos', 'inactivos'] as const).map((f) => (
              <button
                key={f}
                className={`tab-btn btn-sm ${filtroActivo === f ? 'active' : ''}`}
                style={{ minWidth: 'max-content' }}
                onClick={() => setFiltroActivo(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-success btn-sm" onClick={() => setModalCrear(true)}>
            ➕ Crear usuario
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModalInvitar(true)}>
            ✉️ Invitar por email
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="nm-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="nm-table-wrap">
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
              <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 40 }} />
            </div>
          ) : usuariosFiltrados.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">👥</span>
              <p className="empty-state__title">Sin usuarios</p>
            </div>
          ) : (
            <table className="nm-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="user-avatar">
                          {getInitials(u.nombre)}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {u.nombre}
                          {u.es_admin_principal && (
                            <span className="badge badge-orange" style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                              Principal
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{u.correo}</td>
                    <td>
                      <span className={`badge ${ROL_BADGE[u.rol]}`}>
                        {ROL_LABELS[u.rol]}
                      </span>
                    </td>
                    <td>
                      <Toggle
                        id={`activo-${u.id}`}
                        checked={u.activo}
                        onChange={() => toggleActivo(u)}
                      />
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-neutral btn-icon btn-sm"
                          title="Editar usuario"
                          onClick={() => setModalEditar(u)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-neutral btn-icon btn-sm"
                          title="Gestionar permisos"
                          onClick={() => setModalPermisos(u)}
                        >
                          🔑
                        </button>
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          title={
                            u.es_admin_principal
                              ? 'No se puede eliminar al administrador principal'
                              : 'Eliminar usuario'
                          }
                          disabled={u.es_admin_principal}
                          style={
                            u.es_admin_principal
                              ? { opacity: 0.5, cursor: 'not-allowed' }
                              : undefined
                          }
                          onClick={() => !u.es_admin_principal && setModalEliminar(u)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Editar usuario */}
      {modalEditar && (
        <ModalEditarUsuario
          usuario={modalEditar}
          supabase={supabase}
          onClose={() => setModalEditar(null)}
          onSaved={() => { setModalEditar(null); fetchUsuarios(); showToast('Usuario actualizado', 'success'); }}
          showToast={showToast}
        />
      )}

      {/* Modal: Permisos */}
      {modalPermisos && (
        <ModalPermisos
          usuario={modalPermisos}
          supabase={supabase}
          onClose={() => setModalPermisos(null)}
          onSaved={() => { setModalPermisos(null); fetchUsuarios(); showToast('Permisos actualizados', 'success'); }}
          showToast={showToast}
        />
      )}

      {/* Modal: Crear usuario directo */}
      {modalCrear && (
        <ModalCrearUsuarioDirecto
          supabase={supabase}
          onClose={() => setModalCrear(false)}
          onCreated={() => { setModalCrear(false); fetchUsuarios(); showToast('Usuario creado con éxito', 'success'); }}
          showToast={showToast}
        />
      )}

      {/* Modal: Invitar */}
      {modalInvitar && (
        <ModalInvitar
          supabase={supabase}
          onClose={() => setModalInvitar(false)}
          showToast={showToast}
        />
      )}

      {/* Modal: Eliminar */}
      {modalEliminar && (
        <ModalEliminarUsuario
          usuario={modalEliminar}
          supabase={supabase}
          onClose={() => setModalEliminar(null)}
          onDeleted={() => { setModalEliminar(null); fetchUsuarios(); showToast('Usuario eliminado', 'success'); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─── Modal: Editar Usuario ─────────────────────────────────────
function ModalEditarUsuario({
  usuario,
  supabase,
  onClose,
  onSaved,
  showToast,
}: {
  usuario: Usuario;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!nombre.trim()) { showToast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('usuarios')
      .update({ nombre: nombre.trim(), rol, activo })
      .eq('id', usuario.id);
    setSaving(false);
    if (error) showToast('Error: ' + error.message, 'error');
    else onSaved();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <span className="modal__title">✏️ Editar Usuario</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Nombre completo</label>
            <input
              className="form-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del usuario"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Rol</label>
            <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Admin</option>
              <option value="chef">Chef</option>
              <option value="mesero">Mesero</option>
              <option value="domiciliario">Domiciliario</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estado</label>
            <label className="toggle-wrap">
              <span className="toggle">
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {activo ? 'Activo' : 'Inactivo'}
              </span>
            </label>
          </div>
          <div className="flex gap-3" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn btn-neutral flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary flex-1" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Permisos ──────────────────────────────────────────
function ModalPermisos({
  usuario,
  supabase,
  onClose,
  onSaved,
  showToast,
}: {
  usuario: Usuario;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [permisos, setPermisos] = useState<Permisos>({ ...usuario.permisos });
  const [saving, setSaving] = useState(false);

  function togglePermiso(key: keyof Permisos) {
    setPermisos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('usuarios')
      .update({ permisos })
      .eq('id', usuario.id);
    setSaving(false);
    if (error) showToast('Error: ' + error.message, 'error');
    else onSaved();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal__header">
          <span className="modal__title">🔑 Permisos — {usuario.nombre}</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="nm-table-wrap" style={{ marginBottom: 'var(--space-4)' }}>
          <table className="nm-table">
            <thead>
              <tr>
                <th>Permiso</th>
                <th style={{ textAlign: 'center' }}>Activado</th>
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISOS.map((key) => (
                <tr key={key}>
                  <td>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{PERMISO_LABELS[key]}</span>
                      <br />
                      <span className="text-muted">{key}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <Toggle
                      id={`perm-${usuario.id}-${key}`}
                      checked={permisos[key]}
                      onChange={() => togglePermiso(key)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-neutral flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar permisos'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Invitar Usuario ───────────────────────────────────
function ModalInvitar({
  supabase,
  onClose,
  showToast,
}: {
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('mesero');
  const [sending, setSending] = useState(false);

  async function handleInvite() {
    if (!correo.trim()) { showToast('Ingresa un correo válido', 'warning'); return; }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: correo.trim(),
      options: {
        data: { nombre: nombre.trim() || correo.trim(), rol },
      },
    });
    setSending(false);
    if (error) showToast('Error al enviar invitación: ' + error.message, 'error');
    else {
      showToast('Invitación enviada a ' + correo.trim(), 'success');
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <span className="modal__title">✉️ Invitar Usuario</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="nm-inset" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            📬 Se enviará una invitación al correo ingresado. El usuario podrá acceder al sistema con ese correo.
          </div>
          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <input
              className="form-input"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre (opcional)</label>
            <input
              className="form-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del usuario"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Rol</label>
            <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Admin</option>
              <option value="chef">Chef</option>
              <option value="mesero">Mesero</option>
              <option value="domiciliario">Domiciliario</option>
            </select>
          </div>
          <div className="flex gap-3" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn btn-neutral flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary flex-1" onClick={handleInvite} disabled={sending}>
              {sending ? 'Enviando...' : '✉️ Enviar invitación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Eliminar Usuario ──────────────────────────────────
function ModalEliminarUsuario({
  usuario,
  supabase,
  onClose,
  onDeleted,
  showToast,
}: {
  usuario: Usuario;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onDeleted: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (usuario.es_admin_principal) return; // Extra safety guard
    setDeleting(true);
    const { error } = await supabase.from('usuarios').delete().eq('id', usuario.id);
    setDeleting(false);
    if (error) showToast('Error al eliminar: ' + error.message, 'error');
    else onDeleted();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal__header">
          <span className="modal__title">🗑️ Eliminar Usuario</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="nm-inset" style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 'var(--space-2)', fontWeight: 600 }}>¿Eliminar a <strong>{usuario.nombre}</strong>?</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Esta acción no se puede deshacer. El usuario perderá acceso al sistema.</p>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-neutral flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn btn-danger flex-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : '🗑️ Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: CONFIGURACIÓN DEL RESTAURANTE
// ============================================================
function TabConfig({
  supabase,
  showToast,
}: {
  supabase: ReturnType<typeof createClient>;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [config, setConfig] = useState<RestauranteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Local form state
  const [nombre, setNombre] = useState('');
  const [slogan, setSlogan] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [direccion, setDireccion] = useState('');
  const [local, setLocal] = useState('');
  const [telefonoFijo, setTelefonoFijo] = useState('');
  const [impresora, setImpresora] = useState(false);
  const [tiempoCocina, setTiempoCocina] = useState(30);
  const [pieFactura, setPieFactura] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [zonas, setZonas] = useState<ZonaDomicilio[]>([]);

  useEffect(() => {
    async function fetchConfig() {
      const { data, error } = await supabase.from('restaurante_config').select('*').single();
      if (error) { showToast('Error al cargar configuración', 'error'); setLoading(false); return; }
      const c = data as RestauranteConfig;
      setConfig(c);
      setNombre(c.nombre ?? '');
      setSlogan(c.slogan ?? '');
      setWhatsapp(c.whatsapp_principal ?? '');
      setDireccion(c.direccion ?? '');
      setLocal(c.local ?? '');
      setTelefonoFijo(c.telefono_fijo ?? '');
      setImpresora(c.impresora_termica_activa);
      setTiempoCocina(c.tiempo_limite_cocina_min);
      setPieFactura(c.pie_factura_texto ?? '');
      setLogoUrl(c.logo_url);
      setCuentas(c.cuentas_bancarias ?? []);
      setZonas(c.costo_domicilio_zonas ?? []);
      setLoading(false);
    }
    fetchConfig();
  }, [supabase]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from('restaurante_config')
      .update({
        nombre,
        slogan: slogan || null,
        whatsapp_principal: whatsapp || null,
        direccion: direccion || null,
        local: local || null,
        telefono_fijo: telefonoFijo || null,
        impresora_termica_activa: impresora,
        tiempo_limite_cocina_min: tiempoCocina,
        pie_factura_texto: pieFactura || null,
        cuentas_bancarias: cuentas,
        costo_domicilio_zonas: zonas,
      })
      .eq('id', config.id);
    setSaving(false);
    if (error) showToast('Error al guardar: ' + error.message, 'error');
    else showToast('Configuración guardada', 'success');
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `logos/restaurante.${ext}`;
    const { error: upError } = await supabase.storage.from('imagenes').upload(path, file, { upsert: true });
    if (upError) { showToast('Error al subir logo: ' + upError.message, 'error'); setUploadingLogo(false); return; }
    const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(path);
    const newUrl = urlData.publicUrl + '?t=' + Date.now();
    await supabase.from('restaurante_config').update({ logo_url: urlData.publicUrl }).eq('id', config.id);
    setLogoUrl(newUrl);
    showToast('Logo actualizado', 'success');
    setUploadingLogo(false);
  }

  // Cuentas bancarias helpers
  function addCuenta() {
    setCuentas((prev) => [...prev, { banco: '', numero: '', titular: '', tipo: 'billetera' }]);
  }
  function removeCuenta(i: number) {
    setCuentas((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateCuenta(i: number, field: keyof CuentaBancaria, value: string) {
    setCuentas((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  // Zonas helpers
  function addZona() {
    setZonas((prev) => [...prev, { zona: '', barrio: '', costo: 0 }]);
  }
  function removeZona(i: number) {
    setZonas((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateZona(i: number, field: keyof ZonaDomicilio, value: string | number) {
    setZonas((prev) => prev.map((z, idx) => idx === i ? { ...z, [field]: value } : z));
  }

  if (loading) {
    return (
      <div className="nm-card">
        <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 40 }} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn flex flex-col gap-4">
      {/* General info */}
      <div className="nm-card">
        <p className="section-title">Información General</p>
        <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Nombre del restaurante *</label>
            <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Áarstova" />
          </div>
          <div className="form-group">
            <label className="form-label">Slogan</label>
            <input className="form-input" value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Tu slogan aquí..." />
          </div>
          <div className="form-group">
            <label className="form-label">WhatsApp principal</label>
            <input className="form-input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="573001234567" />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono fijo</label>
            <input className="form-input" value={telefonoFijo} onChange={(e) => setTelefonoFijo(e.target.value)} placeholder="6011234567" />
          </div>
          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input className="form-input" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle 123 # 45-67" />
          </div>
          <div className="form-group">
            <label className="form-label">Local / Sector</label>
            <input className="form-input" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Local 2, CC Ejemplo" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="nm-card">
        <p className="section-title">Logo del restaurante</p>
        <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div
            className="nm-inset"
            style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--border-radius-md)', flexShrink: 0 }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo actual" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--border-radius-sm)' }} />
            ) : (
              <span style={{ fontSize: '2rem' }}>🏪</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="form-label">Subir nuevo logo (PNG / JPG)</label>
            <label className="btn btn-neutral btn-sm" style={{ cursor: 'pointer' }}>
              {uploadingLogo ? '⏳ Subiendo...' : '📁 Seleccionar archivo'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
              />
            </label>
            <span className="text-muted">Recomendado: 400×400 px, fondo transparente</span>
          </div>
        </div>
      </div>

      {/* Configuración operativa */}
      <div className="nm-card">
        <p className="section-title">Configuración Operativa</p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="toggle-wrap">
              <span className="toggle">
                <input type="checkbox" checked={impresora} onChange={(e) => setImpresora(e.target.checked)} />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </span>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Impresora térmica activa</span>
                <br />
                <span className="text-muted">
                  {impresora
                    ? 'Habilitada: permite impresión térmica.'
                    : 'Deshabilitada: solo PDF.'}
                </span>
              </div>
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Tiempo límite cocina (minutos)</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={120}
              value={tiempoCocina}
              onChange={(e) => setTiempoCocina(Number(e.target.value))}
              style={{ maxWidth: 180 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Pie de factura</label>
            <textarea
              className="form-textarea"
              value={pieFactura}
              onChange={(e) => setPieFactura(e.target.value)}
              placeholder="Gracias por tu preferencia. ¡Vuelve pronto!"
            />
          </div>
        </div>
      </div>

      {/* Cuentas bancarias */}
      <div className="nm-card">
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--space-3)' }}>
          <p className="section-title" style={{ margin: 0 }}>Cuentas Bancarias</p>
          <button className="btn btn-neutral btn-sm" onClick={addCuenta}>+ Agregar</button>
        </div>
        {cuentas.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <span className="empty-state__icon">🏦</span>
            <p className="empty-state__title">Sin cuentas registradas</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cuentas.map((c, i) => (
              <div key={i} className="nm-inset">
                <div className="grid-2" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Banco</label>
                    <input className="form-input" value={c.banco} onChange={(e) => updateCuenta(i, 'banco', e.target.value)} placeholder="Nequi, Bancolombia..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={c.tipo} onChange={(e) => updateCuenta(i, 'tipo', e.target.value)}>
                      <option value="billetera">Billetera digital</option>
                      <option value="cuenta_ahorros">Cuenta de ahorros</option>
                      <option value="cuenta_corriente">Cuenta corriente</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Número</label>
                    <input className="form-input" value={c.numero} onChange={(e) => updateCuenta(i, 'numero', e.target.value)} placeholder="300 123 4567" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Titular</label>
                    <input className="form-input" value={c.titular} onChange={(e) => updateCuenta(i, 'titular', e.target.value)} placeholder="Nombre titular" />
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => removeCuenta(i)}>🗑️ Eliminar cuenta</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zonas de domicilio */}
      <div className="nm-card">
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--space-3)' }}>
          <p className="section-title" style={{ margin: 0 }}>Costo Domicilio por Zona</p>
          <button className="btn btn-neutral btn-sm" onClick={addZona}>+ Agregar zona</button>
        </div>
        {zonas.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <span className="empty-state__icon">🛵</span>
            <p className="empty-state__title">Sin zonas configuradas</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {zonas.map((z, i) => (
              <div key={i} className="nm-inset">
                <div className="grid-3" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Zona</label>
                    <input className="form-input" value={z.zona} onChange={(e) => updateZona(i, 'zona', e.target.value)} placeholder="Zona Norte" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Barrio</label>
                    <input className="form-input" value={z.barrio} onChange={(e) => updateZona(i, 'barrio', e.target.value)} placeholder="Chapinero" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Costo ($)</label>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      value={z.costo}
                      onChange={(e) => updateZona(i, 'costo', Number(e.target.value))}
                      placeholder="5000"
                    />
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => removeZona(i)}>🗑️ Eliminar zona</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
        {saving ? '⏳ Guardando...' : '💾 Guardar configuración'}
      </button>
    </div>
  );
}

// ============================================================
// TAB 3: MESAS
// ============================================================
function TabMesas({
  supabase,
  showToast,
}: {
  supabase: ReturnType<typeof createClient>;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<string | null>(null); // mesa id being edited inline
  const [editData, setEditData] = useState<Partial<Mesa>>({});

  // New mesa form
  const [newNumero, setNewNumero] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newCapacidad, setNewCapacidad] = useState('4');
  const [adding, setAdding] = useState(false);

  const fetchMesas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('mesas').select('*').order('numero', { ascending: true });
    if (error) showToast('Error al cargar mesas: ' + error.message, 'error');
    else setMesas((data as Mesa[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchMesas(); }, [fetchMesas]);

  async function handleAdd() {
    const num = parseInt(newNumero);
    if (!newNumero || isNaN(num) || num < 1) { showToast('Ingresa un número de mesa válido', 'warning'); return; }
    const cap = parseInt(newCapacidad) || 4;
    setAdding(true);
    const { error } = await supabase.from('mesas').insert({
      numero: num,
      nombre: newNombre.trim() || null,
      capacidad: cap,
      estado: 'libre',
      activa: true,
    });
    setAdding(false);
    if (error) showToast('Error al agregar mesa: ' + error.message, 'error');
    else {
      showToast('Mesa agregada', 'success');
      setNewNumero('');
      setNewNombre('');
      setNewCapacidad('4');
      fetchMesas();
    }
  }

  function startEdit(mesa: Mesa) {
    setEditando(mesa.id);
    setEditData({ numero: mesa.numero, nombre: mesa.nombre, capacidad: mesa.capacidad, activa: mesa.activa });
  }

  async function saveEdit(mesa: Mesa) {
    const { error } = await supabase
      .from('mesas')
      .update({
        numero: editData.numero ?? mesa.numero,
        nombre: editData.nombre ?? mesa.nombre,
        capacidad: editData.capacidad ?? mesa.capacidad,
        activa: editData.activa ?? mesa.activa,
      })
      .eq('id', mesa.id);
    if (error) showToast('Error al guardar: ' + error.message, 'error');
    else { showToast('Mesa guardada', 'success'); setEditando(null); fetchMesas(); }
  }

  async function handleDelete(mesa: Mesa) {
    // Check no active pedidos
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id')
      .eq('mesa_id', mesa.id)
      .in('estado', ['pendiente', 'preparacion', 'listo', 'en_camino'])
      .limit(1);
    if (pedidos && pedidos.length > 0) {
      showToast('No se puede eliminar: la mesa tiene pedidos activos', 'warning');
      return;
    }
    const { error } = await supabase.from('mesas').delete().eq('id', mesa.id);
    if (error) showToast('Error al eliminar: ' + error.message, 'error');
    else { showToast('Mesa eliminada', 'success'); fetchMesas(); }
  }

  async function toggleActiva(mesa: Mesa) {
    const { error } = await supabase.from('mesas').update({ activa: !mesa.activa }).eq('id', mesa.id);
    if (error) showToast('Error: ' + error.message, 'error');
    else { fetchMesas(); }
  }

  const ESTADO_BADGE: Record<string, string> = {
    libre:             'badge-green',
    ocupada:           'badge-orange',
    esperando_cuenta:  'badge-pending',
  };
  const ESTADO_LABEL: Record<string, string> = {
    libre:             'Libre',
    ocupada:           'Ocupada',
    esperando_cuenta:  'Esperando cuenta',
  };

  return (
    <div className="animate-fadeIn flex flex-col gap-4">
      {/* Add mesa form */}
      <div className="nm-card">
        <p className="section-title">Agregar nueva mesa</p>
        <div className="flex gap-3" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '0 0 100px' }}>
            <label className="form-label">Número *</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={newNumero}
              onChange={(e) => setNewNumero(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Nombre (opcional)</label>
            <input
              className="form-input"
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              placeholder="Terraza, VIP..."
            />
          </div>
          <div className="form-group" style={{ flex: '0 0 120px' }}>
            <label className="form-label">Capacidad</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={newCapacidad}
              onChange={(e) => setNewCapacidad(e.target.value)}
              placeholder="4"
            />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding} style={{ marginBottom: 2 }}>
            {adding ? 'Agregando...' : '+ Agregar mesa'}
          </button>
        </div>
      </div>

      {/* Mesas table */}
      <div className="nm-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="nm-table-wrap">
          {loading ? (
            <div style={{ padding: 'var(--space-8)' }}>
              <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 40 }} />
            </div>
          ) : mesas.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🪑</span>
              <p className="empty-state__title">Sin mesas</p>
              <p className="empty-state__desc">Agrega la primera mesa usando el formulario de arriba.</p>
            </div>
          ) : (
            <table className="nm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Capacidad</th>
                  <th>Estado</th>
                  <th>Activa</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mesas.map((mesa) => {
                  const isEditing = editando === mesa.id;
                  return (
                    <tr key={mesa.id} style={{ cursor: isEditing ? 'default' : 'pointer' }} onClick={() => !isEditing && startEdit(mesa)}>
                      <td>
                        {isEditing ? (
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={editData.numero ?? mesa.numero}
                            onChange={(e) => setEditData((p) => ({ ...p, numero: parseInt(e.target.value) }))}
                            style={{ maxWidth: 80 }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                            {mesa.numero}
                          </strong>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editData.nombre ?? mesa.nombre ?? ''}
                            onChange={(e) => setEditData((p) => ({ ...p, nombre: e.target.value || null }))}
                            placeholder="Sin nombre"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span style={{ color: mesa.nombre ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {mesa.nombre ?? '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={editData.capacidad ?? mesa.capacidad}
                            onChange={(e) => setEditData((p) => ({ ...p, capacidad: parseInt(e.target.value) }))}
                            style={{ maxWidth: 80 }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span>👥 {mesa.capacidad}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className={`badge ${ESTADO_BADGE[mesa.estado] ?? 'badge-done'}`}>
                          {ESTADO_LABEL[mesa.estado] ?? mesa.estado}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Toggle
                          id={`mesa-activa-${mesa.id}`}
                          checked={isEditing ? (editData.activa ?? mesa.activa) : mesa.activa}
                          onChange={(v) => {
                            if (isEditing) setEditData((p) => ({ ...p, activa: v }));
                            else toggleActiva(mesa);
                          }}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={(e) => { e.stopPropagation(); saveEdit(mesa); }}
                              >
                                ✅ Guardar
                              </button>
                              <button
                                className="btn btn-neutral btn-sm"
                                onClick={(e) => { e.stopPropagation(); setEditando(null); }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-neutral btn-icon btn-sm"
                                title="Editar mesa"
                                onClick={(e) => { e.stopPropagation(); startEdit(mesa); }}
                              >
                                ✏️
                              </button>
                              <button
                                className="btn btn-danger btn-icon btn-sm"
                                title="Eliminar mesa"
                                onClick={(e) => { e.stopPropagation(); handleDelete(mesa); }}
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Crear Usuario Directo ─────────────────────────────
function ModalCrearUsuarioDirecto({
  supabase,
  onClose,
  onCreated,
  showToast,
}: {
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onCreated: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('mesero');
  const [saving, setSaving] = useState(false);

  // Helper para permisos por defecto según rol
  function getPermisosPorRol(r: Rol): Permisos {
    switch (r) {
      case 'admin':
        return {
          menu_ver: true, menu_editar: true, menu_whatsapp: true,
          pedidos_crear: true, pedidos_ver_propios: true, pedidos_ver_todos: true,
          kds_ver: true, domicilios_propios: true, domicilios_todos: true,
          clientes_buscar: true, clientes_editar: true,
          compras_ver: true, compras_editar: true,
          caja: true, reportes: true, admin: true
        };
      case 'chef':
        return {
          menu_ver: true, menu_editar: true, menu_whatsapp: true,
          pedidos_crear: false, pedidos_ver_propios: false, pedidos_ver_todos: true,
          kds_ver: true, domicilios_propios: false, domicilios_todos: true,
          clientes_buscar: false, clientes_editar: false,
          compras_ver: true, compras_editar: true,
          caja: false, reportes: false, admin: false
        };
      case 'mesero':
        return {
          menu_ver: true, menu_editar: false, menu_whatsapp: false,
          pedidos_crear: true, pedidos_ver_propios: true, pedidos_ver_todos: true,
          kds_ver: true, domicilios_propios: false, domicilios_todos: false,
          clientes_buscar: true, clientes_editar: false,
          compras_ver: false, compras_editar: false,
          caja: false, reportes: false, admin: false
        };
      case 'domiciliario':
        return {
          menu_ver: false, menu_editar: false, menu_whatsapp: false,
          pedidos_crear: false, pedidos_ver_propios: false, pedidos_ver_todos: false,
          kds_ver: false, domicilios_propios: true, domicilios_todos: false,
          clientes_buscar: false, clientes_editar: false,
          compras_ver: false, compras_editar: false,
          caja: false, reportes: false, admin: false
        };
    }
  }

  async function handleCreate() {
    if (!nombre.trim()) { showToast('El nombre es requerido', 'warning'); return; }
    if (!password || password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }

    const cleanName = nombre.trim();
    const cleanSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = correo.trim() || `${cleanSlug || 'usuario'}${Math.floor(100 + Math.random() * 900)}@aarstova.com`;

    setSaving(true);

    try {
      const userId = crypto.randomUUID();
      
      const { error } = await supabase.from('usuarios').insert({
        id: userId,
        nombre: cleanName,
        correo: finalEmail,
        rol,
        activo: true,
        es_admin_principal: false,
        permisos: getPermisosPorRol(rol)
      });

      if (error) {
        showToast('Error al crear usuario: ' + error.message, 'error');
      } else {
        showToast(`✅ Usuario ${cleanName} creado correctamente!`, 'success');
        onCreated();
      }
    } catch (err: any) {
      showToast('Error inesperado: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal__header">
          <span className="modal__title">➕ Crear Nuevo Usuario</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Nombre Completo *</label>
            <input
              type="text"
              className="form-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Pedro Mesero"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Rol del Usuario *</label>
            <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="mesero">🪑 Mesero</option>
              <option value="chef">👨‍🍳 Chef / Cocina</option>
              <option value="domiciliario">🛵 Domiciliario</option>
              <option value="admin">⚙️ Administrador</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña / Clave *</label>
            <input
              type="text"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Correo Electrónico (Opcional)</label>
            <input
              type="email"
              className="form-input"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="Dejar vacío para generar email automático"
            />
          </div>
        </div>

        <div className="flex gap-3" style={{ marginTop: 'var(--space-5)' }}>
          <button className="btn btn-neutral flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary flex-1" onClick={handleCreate} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear Usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}
