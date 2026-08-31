'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSesion } from '@/lib/sesion-context';
import type {
  CategoriaMenu,
  Plato,
  PizarraItem,
  MensajeDia,
  RestauranteConfig,
  Quote,
} from '@/lib/types';

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n);
}

// ──────────────────────────────────────────────────────────────────
// TOAST
// ──────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  mensaje: string;
  tipo: ToastType;
}

let toastCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((mensaje: string, tipo: ToastType = 'info') => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return { toasts, push };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.tipo === 'info' ? 'default' : t.tipo}`}
        >
          <span>
            {t.tipo === 'success' && '✅ '}
            {t.tipo === 'error' && '❌ '}
            {t.tipo === 'warning' && '⚠️ '}
            {t.tipo === 'info' && 'ℹ️ '}
          </span>
          <span>{t.mensaje}</span>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// MODAL BASE
// ──────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {children}
        </div>
        {footer && (
          <div
            className="modal__footer"
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              justifyContent: 'flex-end',
              marginTop: 'var(--space-5)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TOGGLE COMPONENT
// ──────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-wrap">
      <span className="toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" />
        <span className="toggle-thumb" />
      </span>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{label}</span>
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────
// CATEGORY FILTER BADGES
// ──────────────────────────────────────────────────────────────────

function CategoryFilter({
  categorias,
  selected,
  onSelect,
}: {
  categorias: CategoriaMenu[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      <button
        className={`badge ${selected === null ? 'badge-orange' : ''}`}
        style={{ cursor: 'pointer', border: 'none' }}
        onClick={() => onSelect(null)}
      >
        Todos
      </button>
      {categorias.map((cat) => (
        <button
          key={cat.id}
          className={`badge ${selected === cat.id ? 'badge-orange' : ''}`}
          style={{ cursor: 'pointer', border: 'none' }}
          onClick={() => onSelect(cat.id)}
        >
          {cat.emoji} {cat.nombre}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 1 — PIZARRA DEL DÍA
// ══════════════════════════════════════════════════════════════════

interface PizarraState {
  precio_hoy: string;
  disponibles: string;
  nota_dia: string;
}

function TabPizarra({
  categorias,
  platos,
  toast,
  canEdit,
}: {
  categorias: CategoriaMenu[];
  platos: Plato[];
  toast: (msg: string, tipo?: ToastType) => void;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const sesion = useSesion();

  const [fecha, setFecha] = useState(todayISO());
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [pizarra, setPizarra] = useState<PizarraItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Local form state per plato
  const [formas, setFormas] = useState<Record<string, PizarraState>>({});

  const fetchPizarra = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pizarra_diaria')
      .select('*, plato:platos(*)')
      .eq('fecha', fecha);
    if (!error && data) setPizarra(data as PizarraItem[]);
    setLoading(false);
  }, [fecha, supabase]);

  useEffect(() => {
    fetchPizarra();
  }, [fetchPizarra]);

  // Sync formas when pizarra changes
  useEffect(() => {
    const next: Record<string, PizarraState> = {};
    pizarra.forEach((item) => {
      next[item.plato_id] = {
        precio_hoy: String(item.precio_hoy),
        disponibles: item.disponibles !== null ? String(item.disponibles) : '',
        nota_dia: item.nota_dia ?? '',
      };
    });
    setFormas((prev) => {
      // Merge: keep local overrides if already editing, but add new items
      const merged = { ...next };
      Object.keys(prev).forEach((k) => {
        if (!merged[k]) merged[k] = prev[k]; // plate activated locally but not yet saved
      });
      return merged;
    });
  }, [pizarra]);

  const activatedIds = new Set(pizarra.filter((p) => p.activo).map((p) => p.plato_id));

  const getForma = (platoId: string, plato: Plato): PizarraState => {
    return (
      formas[platoId] ?? {
        precio_hoy: String(plato.precio_base),
        disponibles: '',
        nota_dia: '',
      }
    );
  };

  const setForma = (platoId: string, patch: Partial<PizarraState>) => {
    setFormas((prev) => ({
      ...prev,
      [platoId]: { ...getForma(platoId, platos.find((p) => p.id === platoId)!), ...patch },
    }));
  };

  // Local "checked" state for plates not yet in pizarra
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set());

  const toggleActivar = (platoId: string, plato: Plato, checked: boolean) => {
    if (checked) {
      setLocalChecked((prev) => new Set([...prev, platoId]));
      if (!formas[platoId]) {
        setFormas((prev) => ({
          ...prev,
          [platoId]: {
            precio_hoy: String(plato.precio_base),
            disponibles: '',
            nota_dia: '',
          },
        }));
      }
    } else {
      setLocalChecked((prev) => {
        const n = new Set(prev);
        n.delete(platoId);
        return n;
      });
    }
  };

  const handleDesactivar = async (item: PizarraItem) => {
    setSaving(true);
    const { error } = await supabase
      .from('pizarra_diaria')
      .update({ activo: false })
      .eq('id', item.id);
    if (error) {
      toast('Error al desactivar: ' + error.message, 'error');
    } else {
      toast('Plato desactivado', 'success');
      fetchPizarra();
      setLocalChecked((prev) => {
        const n = new Set(prev);
        n.delete(item.plato_id);
        return n;
      });
    }
    setSaving(false);
  };

  const handleGuardar = async () => {
    setSaving(true);
    const allActive = new Set([...activatedIds, ...localChecked]);
    // Remove deactivated from allActive
    pizarra.filter((p) => !p.activo).forEach((p) => allActive.delete(p.plato_id));

    let errors = 0;

    for (const platoId of allActive) {
      const plato = platos.find((p) => p.id === platoId);
      if (!plato) continue;
      const forma = getForma(platoId, plato);
      const precio_hoy = parseFloat(forma.precio_hoy) || plato.precio_base;
      const disponibles = forma.disponibles !== '' ? parseInt(forma.disponibles) : null;
      const nota_dia = forma.nota_dia || null;

      const existente = pizarra.find((p) => p.plato_id === platoId);

      if (existente) {
        const { error } = await supabase
          .from('pizarra_diaria')
          .update({ precio_hoy, disponibles, nota_dia, activo: true })
          .eq('id', existente.id);
        if (error) errors++;
      } else {
        const { error } = await supabase.from('pizarra_diaria').insert({
          plato_id: platoId,
          fecha,
          precio_hoy,
          disponibles,
          nota_dia,
          activo: true,
          vendidos: 0,
          creado_por: sesion?.usuario.id ?? null,
        });
        if (error) errors++;
      }
    }

    if (errors > 0) {
      toast(`Se guardaron con ${errors} error(es)`, 'warning');
    } else {
      toast('Pizarra guardada correctamente', 'success');
    }

    setLocalChecked(new Set());
    fetchPizarra();
    setSaving(false);
  };

  const platasFiltradas = platos.filter(
    (p) => !catFilter || p.categoria_id === catFilter,
  );

  const isChecked = (platoId: string) => activatedIds.has(platoId) || localChecked.has(platoId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Controles superiores */}
      <div className="nm-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 180px' }}>
          <label className="form-label">Fecha</label>
          <input
            type="date"
            className="form-input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGuardar}
          disabled={saving || !canEdit}
        >
          {saving ? '⏳ Guardando…' : '💾 Guardar pizarra del día'}
        </button>
      </div>

      {/* Filtro categorías */}
      <CategoryFilter categorias={categorias} selected={catFilter} onSelect={setCatFilter} />

      {/* Estado loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          ⏳ Cargando pizarra…
        </div>
      )}

      {/* Grid de platos */}
      {!loading && (
        <div className="grid-2">
          {platasFiltradas.map((plato) => {
            const checked = isChecked(plato.id);
            const forma = getForma(plato.id, plato);
            const pizarraItem = pizarra.find((p) => p.plato_id === plato.id && p.activo);
            const vendidos = pizarraItem?.vendidos ?? 0;
            const disponibles = pizarraItem?.disponibles ?? null;

            return (
              <div
                key={plato.id}
                className="nm-card"
                style={{
                  borderLeft: checked ? '4px solid var(--green)' : '4px solid transparent',
                  transition: 'border-color var(--transition-fast)',
                }}
              >
                {/* Cabecera */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  {canEdit && (
                    <label className="nm-checkbox" style={{ marginTop: 2 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleActivar(plato.id, plato, e.target.checked)}
                        disabled={!canEdit}
                      />
                      <span className="nm-checkbox-box" />
                    </label>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {plato.nombre}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {plato.emojis_ingredientes}
                    </div>
                    {plato.categoria && (
                      <span className="badge badge-orange" style={{ marginTop: 'var(--space-1)' }}>
                        {plato.categoria.emoji} {plato.categoria.nombre}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Base</div>
                    <div style={{ fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                      {formatCOP(plato.precio_base)}
                    </div>
                  </div>
                </div>

                {/* Detalles vendidos/disponibles */}
                {pizarraItem && (
                  <div
                    className="nm-inset"
                    style={{
                      display: 'flex',
                      gap: 'var(--space-4)',
                      marginBottom: 'var(--space-3)',
                      padding: 'var(--space-2) var(--space-3)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Vendidos</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>{vendidos}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Disponibles</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                        {disponibles === null ? '∞' : Math.max(0, disponibles - vendidos)}
                      </div>
                    </div>
                    {pizarraItem.precio_hoy !== plato.precio_base && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Precio hoy</div>
                        <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--status-prep)' }}>
                          {formatCOP(pizarraItem.precio_hoy)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Formulario cuando está activado */}
                {checked && canEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Precio hoy</label>
                        <input
                          type="number"
                          className="form-input"
                          value={forma.precio_hoy}
                          onChange={(e) => setForma(plato.id, { precio_hoy: e.target.value })}
                          min={0}
                          step={500}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Cupo (vacío = ∞)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={forma.disponibles}
                          onChange={(e) => setForma(plato.id, { disponibles: e.target.value })}
                          min={0}
                          placeholder="Ilimitado"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nota del día (opcional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={forma.nota_dia}
                        onChange={(e) => setForma(plato.id, { nota_dia: e.target.value })}
                        placeholder="Ej: Sin picante hoy…"
                      />
                    </div>
                    {pizarraItem && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDesactivar(pizarraItem)}
                        disabled={saving}
                      >
                        🚫 Desactivar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && platasFiltradas.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🍽️</div>
          <div className="empty-state__title">Sin platos en esta categoría</div>
          <div className="empty-state__desc">Agrega platos en la pestaña Banco de Platos</div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 2 — BANCO DE PLATOS
// ══════════════════════════════════════════════════════════════════

interface PlatoForm {
  nombre: string;
  descripcion_base: string;
  emojis_ingredientes: string;
  precio_base: string;
  categoria_id: string;
  activo_permanente: boolean;
}

const emptyPlatoForm = (): PlatoForm => ({
  nombre: '',
  descripcion_base: '',
  emojis_ingredientes: '',
  precio_base: '',
  categoria_id: '',
  activo_permanente: true,
});

function TabBanco({
  categorias,
  platos,
  onRefresh,
  toast,
  canEdit,
}: {
  categorias: CategoriaMenu[];
  platos: Plato[];
  onRefresh: () => void;
  toast: (msg: string, tipo?: ToastType) => void;
  canEdit: boolean;
}) {
  const supabase = createClient();

  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlato, setEditingPlato] = useState<Plato | null>(null);
  const [form, setForm] = useState<PlatoForm>(emptyPlatoForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Categorías CRUD
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatNombre, setNewCatNombre] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('🍽️');
  const [savingCat, setSavingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  const openNew = () => {
    setEditingPlato(null);
    setForm(emptyPlatoForm());
    setModalOpen(true);
  };

  const openEdit = (plato: Plato) => {
    setEditingPlato(plato);
    setForm({
      nombre: plato.nombre,
      descripcion_base: plato.descripcion_base ?? '',
      emojis_ingredientes: plato.emojis_ingredientes,
      precio_base: String(plato.precio_base),
      categoria_id: plato.categoria_id ?? '',
      activo_permanente: plato.activo_permanente,
    });
    setModalOpen(true);
  };

  const handleSavePlato = async () => {
    if (!form.nombre.trim()) {
      toast('El nombre es obligatorio', 'warning');
      return;
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion_base: form.descripcion_base.trim() || null,
      emojis_ingredientes: form.emojis_ingredientes.trim(),
      precio_base: parseFloat(form.precio_base) || 0,
      categoria_id: form.categoria_id || null,
      activo_permanente: form.activo_permanente,
    };

    if (editingPlato) {
      const { error } = await supabase
        .from('platos')
        .update(payload)
        .eq('id', editingPlato.id);
      if (error) toast('Error al actualizar: ' + error.message, 'error');
      else { toast('Plato actualizado', 'success'); setModalOpen(false); onRefresh(); }
    } else {
      const { error } = await supabase.from('platos').insert(payload);
      if (error) toast('Error al crear: ' + error.message, 'error');
      else { toast('Plato creado', 'success'); setModalOpen(false); onRefresh(); }
    }
    setSaving(false);
  };

  const handleDeletePlato = async (plato: Plato) => {
    if (!confirm(`¿Eliminar el plato "${plato.nombre}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(plato.id);
    const { error } = await supabase.from('platos').delete().eq('id', plato.id);
    if (error) toast('Error al eliminar: ' + error.message, 'error');
    else { toast('Plato eliminado', 'success'); onRefresh(); }
    setDeletingId(null);
  };

  const handleSaveCat = async () => {
    if (!newCatNombre.trim()) {
      toast('El nombre de la categoría es obligatorio', 'warning');
      return;
    }
    setSavingCat(true);
    const maxOrden = categorias.length > 0 ? Math.max(...categorias.map((c) => c.orden)) + 1 : 1;
    const { error } = await supabase.from('categorias_menu').insert({
      nombre: newCatNombre.trim(),
      emoji: newCatEmoji.trim() || '🍽️',
      orden: maxOrden,
      activa: true,
    });
    if (error) toast('Error al crear categoría: ' + error.message, 'error');
    else {
      toast('Categoría creada', 'success');
      setNewCatNombre('');
      setNewCatEmoji('🍽️');
      onRefresh();
    }
    setSavingCat(false);
  };

  const handleDeleteCat = async (cat: CategoriaMenu) => {
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
    setDeletingCatId(cat.id);
    const { error } = await supabase.from('categorias_menu').delete().eq('id', cat.id);
    if (error) toast('Error: ' + error.message, 'error');
    else { toast('Categoría eliminada', 'success'); onRefresh(); }
    setDeletingCatId(null);
  };

  const platasFiltradas = platos.filter((p) => {
    const matchCat = !catFilter || p.categoria_id === catFilter;
    const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Barra superior */}
      <div className="nm-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label className="form-label">Buscar plato</label>
          <input
            type="search"
            className="form-input"
            placeholder="Nombre del plato…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            ➕ Nuevo plato
          </button>
        )}
      </div>

      {/* Filtro categorías */}
      <CategoryFilter categorias={categorias} selected={catFilter} onSelect={setCatFilter} />

      {/* Lista de platos */}
      {platasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🍽️</div>
          <div className="empty-state__title">No hay platos</div>
          <div className="empty-state__desc">
            {search ? `Sin resultados para "${search}"` : 'Agrega el primer plato'}
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {platasFiltradas.map((plato) => (
            <div key={plato.id} className="nm-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                    {plato.nombre}
                  </div>
                  <div style={{ fontSize: '1.1rem', marginBottom: 'var(--space-1)' }}>{plato.emojis_ingredientes}</div>
                  {plato.descripcion_base && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                      {plato.descripcion_base}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                    {plato.categoria && (
                      <span className="badge badge-orange">
                        {plato.categoria.emoji} {plato.categoria.nombre}
                      </span>
                    )}
                    <span
                      className={`badge ${plato.activo_permanente ? 'badge-green' : 'badge-done'}`}
                    >
                      {plato.activo_permanente ? '✅ Activo' : '⏸ Inactivo'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                    {formatCOP(plato.precio_base)}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                      <button
                        className="btn btn-icon btn-neutral btn-sm"
                        onClick={() => openEdit(plato)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-icon btn-neutral btn-sm"
                        onClick={() => handleDeletePlato(plato)}
                        disabled={deletingId === plato.id}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sección Categorías ── */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <div className="section-title">Categorías del menú</div>
        <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {categorias.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin categorías todavía.</div>
          )}
          {categorias.map((cat) => (
            <div
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--border-radius-md)',
                background: 'var(--bg-raised)',
              }}
            >
              <span style={{ fontSize: '0.9rem', cursor: 'grab', color: 'var(--text-muted)' }} title="Orden (drag visual)">
                ⠿
              </span>
              <span style={{ fontSize: '1.2rem' }}>{cat.emoji}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{cat.nombre}</span>
              <span className="badge badge-done">#{cat.orden}</span>
              {canEdit && (
                <button
                  className="btn btn-icon btn-ghost btn-sm"
                  onClick={() => handleDeleteCat(cat)}
                  disabled={deletingCatId === cat.id}
                  title="Eliminar categoría"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}

          {/* Agregar categoría */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Emoji"
                value={newCatEmoji}
                onChange={(e) => setNewCatEmoji(e.target.value)}
                style={{ width: 72, minHeight: 40 }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Nombre de la categoría"
                value={newCatNombre}
                onChange={(e) => setNewCatNombre(e.target.value)}
                style={{ flex: 1, minWidth: 140, minHeight: 40 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCat(); }}
              />
              <button
                className="btn btn-success"
                onClick={handleSaveCat}
                disabled={savingCat}
                style={{ minHeight: 40 }}
              >
                {savingCat ? '⏳' : '➕ Agregar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal plato */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPlato ? `✏️ Editar: ${editingPlato.nombre}` : '➕ Nuevo plato'}
        footer={
          <>
            <button className="btn btn-neutral" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSavePlato} disabled={saving}>
              {saving ? '⏳ Guardando…' : editingPlato ? 'Guardar cambios' : 'Crear plato'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nombre *</label>
          <input
            type="text"
            className="form-input"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Bandeja paisa"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción base</label>
          <textarea
            className="form-textarea"
            value={form.descripcion_base}
            onChange={(e) => setForm((f) => ({ ...f, descripcion_base: e.target.value }))}
            placeholder="Descripción del plato…"
            style={{ minHeight: 80 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Emojis ingredientes</label>
          <input
            type="text"
            className="form-input"
            value={form.emojis_ingredientes}
            onChange={(e) => setForm((f) => ({ ...f, emojis_ingredientes: e.target.value }))}
            placeholder="🥩🍚🫘🥚🌽"
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Precio base</label>
            <input
              type="number"
              className="form-input"
              value={form.precio_base}
              onChange={(e) => setForm((f) => ({ ...f, precio_base: e.target.value }))}
              min={0}
              step={500}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Categoría</label>
            <select
              className="form-select"
              value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
            >
              <option value="">Sin categoría</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Toggle
          checked={form.activo_permanente}
          onChange={(v) => setForm((f) => ({ ...f, activo_permanente: v }))}
          label="Activo permanentemente"
        />
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 3 — GENERADOR WHATSAPP
// ══════════════════════════════════════════════════════════════════

function TabWhatsApp({
  pizarraActiva,
  config,
  toast,
}: {
  pizarraActiva: PizarraItem[];
  config: RestauranteConfig | null;
  toast: (msg: string, tipo?: ToastType) => void;
}) {
  const supabase = createClient();
  const sesion = useSesion();

  const [frase, setFrase] = useState('');
  const [autorFrase, setAutorFrase] = useState('');
  const [nombreChef, setNombreChef] = useState('');
  const [costoEmpaque, setCostoEmpaque] = useState('0');
  const [incluirLogo, setIncluirLogo] = useState(false);
  const [loadingFrase, setLoadingFrase] = useState(false);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLTextAreaElement>(null);

  // Cargar mensaje guardado del día
  useEffect(() => {
    const cargar = async () => {
      const today = todayISO();
      const { data } = await supabase
        .from('mensaje_dia')
        .select('*')
        .eq('fecha', today)
        .single();
      if (data) {
        const m = data as MensajeDia;
        setFrase(m.frase ?? '');
        setAutorFrase(m.autor_frase ?? '');
        setNombreChef(m.nombre_chef ?? '');
        setCostoEmpaque(String(m.costo_empaque ?? 0));
        setIncluirLogo(m.incluir_logo ?? false);
      }
    };
    cargar();
  }, [supabase]);

  const getFraseAleatoria = async () => {
    setLoadingFrase(true);
    try {
      const res = await fetch('/quotes.json');
      if (!res.ok) throw new Error('No se pudo cargar');
      const quotes: Quote[] = await res.json();
      if (quotes.length === 0) throw new Error('Vacío');
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      setFrase(q.frase);
      setAutorFrase(q.autor);
    } catch {
      toast('No se pudo cargar la frase aleatoria', 'error');
    }
    setLoadingFrase(false);
  };

  const generarMensaje = (): string => {
    const costo = parseFloat(costoEmpaque) || 0;
    const nombre_restaurante = config?.nombre ?? 'Restaurante';
    const local = config?.local ?? '';
    const whatsapp = config?.whatsapp_principal ?? '';
    const telefono = config?.telefono_fijo ?? '';

    let msg = '';
    if (frase) msg += `🎶 ${frase}\n\n`;
    if (nombreChef) msg += `*${nombreChef}* 🧑🏻‍🍳\n\n`;
    if (costo > 0) {
      msg += `🍶🍱💲${costo} *adicionales* *(Empaque Termoformados)*\n\n`;
    }

    pizarraActiva.forEach((item) => {
      if (!item.plato) return;
      msg += `☄️${item.plato.nombre}.\n`;
      if (item.plato.emojis_ingredientes) msg += `${item.plato.emojis_ingredientes}\n`;
      if (item.precio_hoy !== item.plato.precio_base) {
        msg += `💲 *${formatCOP(item.precio_hoy)}.*\n`;
      }
      msg += `\n`;
    });

    msg += `*${nombre_restaurante}*\n🏤\n`;
    if (local) msg += `*${local}*\n`;
    if (whatsapp) msg += `📲 *${whatsapp}.*\n`;
    if (telefono) msg += `☎️ *${telefono}.*\n`;
    msg += `*Servicio a domicilio*\n🏍️`;

    return msg;
  };

  const mensajeGenerado = generarMensaje();

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensajeGenerado);
      toast('Mensaje copiado al portapapeles', 'success');
    } catch {
      toast('No se pudo copiar. Copia manualmente.', 'error');
    }
  };

  const handleGuardar = async () => {
    setSaving(true);
    const today = todayISO();
    const payload = {
      fecha: today,
      frase: frase || null,
      autor_frase: autorFrase || null,
      nombre_chef: nombreChef || null,
      costo_empaque: parseFloat(costoEmpaque) || 0,
      incluir_logo: incluirLogo,
      mensaje_generado: mensajeGenerado,
      creado_por: sesion?.usuario.id ?? null,
    };

    // Upsert
    const { data: existing } = await supabase
      .from('mensaje_dia')
      .select('id')
      .eq('fecha', today)
      .single();

    let error;
    if (existing) {
      ({ error } = await supabase.from('mensaje_dia').update(payload).eq('fecha', today));
    } else {
      ({ error } = await supabase.from('mensaje_dia').insert(payload));
    }

    if (error) toast('Error al guardar: ' + error.message, 'error');
    else toast('Mensaje del día guardado', 'success');
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Frase del día */}
        <div className="form-group">
          <label className="form-label">Frase del día</label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <textarea
              className="form-textarea"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              placeholder="Escribe o genera una frase…"
              style={{ flex: 1, minHeight: 80 }}
            />
          </div>
          <button
            className="btn btn-neutral btn-sm"
            onClick={getFraseAleatoria}
            disabled={loadingFrase}
            style={{ alignSelf: 'flex-start' }}
          >
            {loadingFrase ? '⏳' : '🎲'} Frase aleatoria
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Autor de la frase</label>
          <input
            type="text"
            className="form-input"
            value={autorFrase}
            onChange={(e) => setAutorFrase(e.target.value)}
            placeholder="Ej: Gabriel García Márquez"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Nombre del chef</label>
          <input
            type="text"
            className="form-input"
            value={nombreChef}
            onChange={(e) => setNombreChef(e.target.value)}
            placeholder="Ej: Chef Andrés"
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Costo empaque</label>
            <input
              type="number"
              className="form-input"
              value={costoEmpaque}
              onChange={(e) => setCostoEmpaque(e.target.value)}
              min={0}
              step={500}
            />
          </div>
          <div style={{ paddingBottom: 'var(--space-2)' }}>
            <Toggle
              checked={incluirLogo}
              onChange={setIncluirLogo}
              label="Incluir logo"
            />
          </div>
        </div>
      </div>

      {/* Vista previa del mensaje */}
      <div>
        <div className="section-title">Vista previa del mensaje</div>
        <div className="nm-inset" style={{ position: 'relative' }}>
          <textarea
            ref={previewRef}
            className="form-textarea"
            readOnly
            value={mensajeGenerado}
            style={{
              minHeight: 280,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              resize: 'none',
              padding: 0,
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Platos activos en la pizarra (resumen) */}
      {pizarraActiva.length === 0 && (
        <div
          className="nm-card"
          style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: 'var(--space-4)' }}
        >
          ⚠️ No hay platos activos en la pizarra de hoy. El mensaje no incluirá platos.
        </div>
      )}

      {/* Botones */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-success" onClick={handleCopiar} style={{ flex: 1, minWidth: 160 }}>
          📋 Copiar al portapapeles
        </button>
        <button
          className="btn btn-primary"
          onClick={handleGuardar}
          disabled={saving}
          style={{ flex: 1, minWidth: 160 }}
        >
          {saving ? '⏳ Guardando…' : '💾 Guardar mensaje del día'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════

type Tab = 'pizarra' | 'banco' | 'whatsapp';

export default function MenuPage() {
  const supabase = createClient();
  const sesion = useSesion();
  const { toasts, push: toast } = useToast();

  const [tab, setTab] = useState<Tab>('pizarra');
  const [categorias, setCategorias] = useState<CategoriaMenu[]>([]);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [pizarraHoy, setPizarraHoy] = useState<PizarraItem[]>([]);
  const [config, setConfig] = useState<RestauranteConfig | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const canEdit = sesion?.permisos.menu_editar === true;
  const canWhatsApp = sesion?.permisos.menu_whatsapp === true;

  const fetchAll = useCallback(async () => {
    const [catRes, platosRes, pizarraRes, configRes] = await Promise.all([
      supabase.from('categorias_menu').select('*').order('orden'),
      supabase.from('platos').select('*, categoria:categorias_menu(*)').order('nombre'),
      supabase
        .from('pizarra_diaria')
        .select('*, plato:platos(*)')
        .eq('fecha', todayISO())
        .eq('activo', true),
      supabase.from('restaurante_config').select('*').single(),
    ]);

    if (catRes.data) setCategorias(catRes.data as CategoriaMenu[]);
    if (platosRes.data) setPlatos(platosRes.data as Plato[]);
    if (pizarraRes.data) setPizarraHoy(pizarraRes.data as PizarraItem[]);
    if (configRes.data) setConfig(configRes.data as RestauranteConfig);
    setInitialLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
        <div className="skeleton" style={{ height: 40, borderRadius: 'var(--border-radius-lg)' }} />
        <div className="skeleton" style={{ height: 60, borderRadius: 'var(--border-radius-lg)' }} />
        <div className="grid-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--border-radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!sesion?.permisos.menu_ver) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🔒</div>
        <div className="empty-state__title">Sin acceso</div>
        <div className="empty-state__desc">No tienes permiso para ver el módulo de Menú.</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: string; visible: boolean }[] = [
    { id: 'pizarra', label: 'Pizarra del Día', icon: '📋', visible: true },
    { id: 'banco', label: 'Banco de Platos', icon: '🍽️', visible: true },
    { id: 'whatsapp', label: 'Generador WhatsApp', icon: '💬', visible: canWhatsApp },
  ];

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <h1>🍽️ Menú</h1>
          <div className="page-subtitle">
            Gestiona la pizarra del día, el banco de platos y los mensajes de WhatsApp.
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist" style={{ marginBottom: 'var(--space-5)' }}>
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
      </div>

      {/* Tab Content */}
      {tab === 'pizarra' && (
        <TabPizarra
          categorias={categorias}
          platos={platos}
          toast={toast}
          canEdit={canEdit}
        />
      )}

      {tab === 'banco' && (
        <TabBanco
          categorias={categorias}
          platos={platos}
          onRefresh={fetchAll}
          toast={toast}
          canEdit={canEdit}
        />
      )}

      {tab === 'whatsapp' && canWhatsApp && (
        <TabWhatsApp
          pizarraActiva={pizarraHoy}
          config={config}
          toast={toast}
        />
      )}
    </>
  );
}
