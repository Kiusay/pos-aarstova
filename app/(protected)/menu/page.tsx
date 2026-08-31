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
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
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
        style={{ cursor: 'pointer', border: 'none', padding: '6px 12px', fontSize: '0.85rem' }}
        onClick={() => onSelect(null)}
      >
        Todos
      </button>
      {categorias.map((cat) => (
        <button
          key={cat.id}
          className={`badge ${selected === cat.id ? 'badge-orange' : ''}`}
          style={{ cursor: 'pointer', border: 'none', padding: '6px 12px', fontSize: '0.85rem' }}
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
  const sesion = useSesion();

  const [fecha, setFecha] = useState(todayISO());
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [soloActivos, setSoloActivos] = useState(false);
  const [pizarra, setPizarra] = useState<PizarraItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formas, setFormas] = useState<Record<string, PizarraState>>({});
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const next: Record<string, PizarraState> = {};
    pizarra.forEach((item) => {
      next[item.plato_id] = {
        precio_hoy: String(item.precio_hoy),
        disponibles: item.disponibles !== null ? String(item.disponibles) : '',
        nota_dia: item.nota_dia ?? '',
      };
    });
    setFormas((prev) => ({ ...next, ...prev }));
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

  const toggleActivar = async (platoId: string, plato: Plato, checked: boolean) => {
    setSaving(true);
    const forma = getForma(platoId, plato);
    const precio_hoy = parseFloat(forma.precio_hoy) || plato.precio_base;
    const disponibles = forma.disponibles !== '' ? parseInt(forma.disponibles) : null;
    const nota_dia = forma.nota_dia || null;

    const existente = pizarra.find((p) => p.plato_id === platoId);

    if (checked) {
      if (existente) {
        const { error } = await supabase
          .from('pizarra_diaria')
          .update({ activo: true, precio_hoy, disponibles, nota_dia })
          .eq('id', existente.id);
        if (error) toast('Error activando plato: ' + error.message, 'error');
        else toast(`✅ ${plato.nombre} activado para hoy`, 'success');
      } else {
        const { error } = await supabase.from('pizarra_diaria').insert({
          plato_id: platoId,
          fecha,
          precio_hoy,
          disponibles,
          nota_dia,
          activo: true,
          vendidos: 0,
          creado_por: sesion?.usuario?.id ?? null,
        });
        if (error) toast('Error al activar plato: ' + error.message, 'error');
        else toast(`✅ ${plato.nombre} activado para hoy`, 'success');
      }
    } else {
      if (existente) {
        const { error } = await supabase
          .from('pizarra_diaria')
          .update({ activo: false })
          .eq('id', existente.id);
        if (error) toast('Error al desactivar: ' + error.message, 'error');
        else toast(`⚪ ${plato.nombre} desactivado para hoy`, 'info');
      }
    }

    setLocalChecked(new Set());
    await fetchPizarra();
    onRefresh();
    setSaving(false);
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
      toast('Plato inactivo para hoy', 'success');
      setLocalChecked((prev) => {
        const n = new Set(prev);
        n.delete(item.plato_id);
        return n;
      });
      await fetchPizarra();
      onRefresh();
    }
    setSaving(false);
  };

  const handleGuardar = async () => {
    setSaving(true);
    const activeItems = pizarra.filter((p) => p.activo);
    let errors = 0;

    for (const item of activeItems) {
      const plato = platos.find((p) => p.id === item.plato_id);
      if (!plato) continue;
      const forma = getForma(item.plato_id, plato);
      const precio_hoy = parseFloat(forma.precio_hoy) || plato.precio_base;
      const disponibles = forma.disponibles !== '' ? parseInt(forma.disponibles) : null;
      const nota_dia = forma.nota_dia || null;

      const { error } = await supabase
        .from('pizarra_diaria')
        .update({ precio_hoy, disponibles, nota_dia })
        .eq('id', item.id);
      if (error) errors++;
    }

    if (errors > 0) {
      toast(`Se guardó con ${errors} aviso(s)`, 'warning');
    } else {
      toast('Precios y notas guardados correctamente', 'success');
    }

    await fetchPizarra();
    onRefresh();
    setSaving(false);
  };

  const isChecked = (platoId: string) => activatedIds.has(platoId) || localChecked.has(platoId);

  const platasFiltradas = platos.filter((p) => {
    const matchCat = !catFilter || p.categoria_id === catFilter;
    const matchActive = !soloActivos || isChecked(p.id);
    return matchCat && matchActive;
  });

  const activosCount = platos.filter((p) => isChecked(p.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Controles superiores */}
      <div className="nm-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="form-label">Fecha del Menú</label>
            <input
              type="date"
              className="form-input"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="badge badge-orange" style={{ padding: '8px 14px', fontSize: '0.9rem' }}>
            🍽️ {activosCount} de {platos.length} platos activos hoy
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleGuardar}
            disabled={saving || !canEdit}
            style={{ padding: '10px 20px', fontWeight: 700 }}
          >
            {saving ? '⏳ Guardando…' : '💾 Guardar Pizarra del Día'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <CategoryFilter categorias={categorias} selected={catFilter} onSelect={setCatFilter} />
        <Toggle
          checked={soloActivos}
          onChange={setSoloActivos}
          label="Ver solo platos activos hoy"
        />
      </div>

      {/* Estado loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          ⏳ Cargando pizarra del día…
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
                  borderLeft: checked ? '5px solid var(--green)' : '5px solid var(--border)',
                  background: checked ? 'var(--bg-base)' : 'var(--bg-raised)',
                  opacity: checked ? 1 : 0.85,
                  transition: 'all var(--transition-fast)',
                }}
              >
                {/* Header card */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {plato.nombre}
                      </span>
                      {plato.categoria && (
                        <span className="badge badge-orange">
                          {plato.categoria.emoji} {plato.categoria.nombre}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {plato.emojis_ingredientes}
                    </div>
                    {plato.descripcion_base && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                        {plato.descripcion_base}
                      </div>
                    )}
                  </div>

                  {/* Switch de activación */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <Toggle
                      checked={checked}
                      onChange={(v) => toggleActivar(plato.id, plato, v)}
                      label={checked ? '✅ Activo' : '⚪ Inactivo'}
                    />
                  </div>
                </div>

                {/* Si está activo, muestra configuración del día */}
                {checked && (
                  <div className="nm-inset" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-2)', borderRadius: 'var(--border-radius-md)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Precio Hoy ($)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={forma.precio_hoy}
                          onChange={(e) => setForma(plato.id, { precio_hoy: e.target.value })}
                          min={0}
                          step={500}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Cupo (Vacío = ∞)</label>
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

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Nota del día (Opcional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={forma.nota_dia}
                        onChange={(e) => setForma(plato.id, { nota_dia: e.target.value })}
                        placeholder="Ej: Incluye limonada de coco..."
                      />
                    </div>

                    {pizarraItem && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Vendidos hoy: <strong>{vendidos}</strong> | Disponibles: <strong>{disponibles === null ? '∞' : Math.max(0, disponibles - vendidos)}</strong>
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDesactivar(pizarraItem)}
                          style={{ color: 'var(--status-cancel)', padding: '2px 8px', fontSize: '0.75rem' }}
                        >
                          Desactivar hoy
                        </button>
                      </div>
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
          <div className="empty-state__title">No hay platos disponibles</div>
          <div className="empty-state__desc">Crea platos en la pestaña "Banco de Platos" para añadirlos aquí.</div>
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

  // Categorías
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
      emojis_ingredientes: plato.emojis_ingredientes ?? '',
      precio_base: String(plato.precio_base),
      categoria_id: plato.categoria_id ?? '',
      activo_permanente: plato.activo_permanente,
    });
    setModalOpen(true);
  };

  const openDuplicate = (plato: Plato) => {
    setEditingPlato(null);
    setForm({
      nombre: `${plato.nombre} (Copia)`,
      descripcion_base: plato.descripcion_base ?? '',
      emojis_ingredientes: plato.emojis_ingredientes ?? '',
      precio_base: String(plato.precio_base),
      categoria_id: plato.categoria_id ?? '',
      activo_permanente: true,
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
      else { toast('Plato registrado en el catálogo', 'success'); setModalOpen(false); onRefresh(); }
    }
    setSaving(false);
  };

  const handleDeletePlato = async (plato: Plato) => {
    if (!confirm(`¿Eliminar el plato "${plato.nombre}"? Esta acción borrará el registro del menú.`)) return;
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
      <div className="nm-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="form-group" style={{ flex: '1 1 240px', margin: 0 }}>
          <input
            type="search"
            className="form-input"
            placeholder="🔍 Buscar plato en el catálogo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            ➕ Crear Nuevo Plato
          </button>
        )}
      </div>

      {/* Filtro categorías */}
      <CategoryFilter categorias={categorias} selected={catFilter} onSelect={setCatFilter} />

      {/* Lista de platos */}
      {platasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🍽️</div>
          <div className="empty-state__title">No hay platos registrados</div>
          <div className="empty-state__desc">
            {search ? `Sin resultados para "${search}"` : 'Agrega el primer plato a la biblioteca'}
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {platasFiltradas.map((plato) => (
            <div key={plato.id} className="nm-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {plato.nombre}
                    </div>
                    <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{plato.emojis_ingredientes}</div>
                    {plato.descripcion_base && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                        {plato.descripcion_base}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '1.05rem' }}>
                      {formatCOP(plato.precio_base)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                  {plato.categoria && (
                    <span className="badge badge-orange">
                      {plato.categoria.emoji} {plato.categoria.nombre}
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              {canEdit && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-neutral btn-sm"
                    onClick={() => openDuplicate(plato)}
                    title="Duplicar este plato para crear una variante"
                  >
                    📋 Duplicar
                  </button>
                  <button
                    className="btn btn-neutral btn-sm"
                    onClick={() => openEdit(plato)}
                    title="Editar"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeletePlato(plato)}
                    disabled={deletingId === plato.id}
                    title="Eliminar"
                    style={{ color: 'var(--status-cancel)' }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sección Categorías */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <div className="section-title">Categorías del Menú</div>
        <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
                placeholder="Nueva categoría..."
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
        title={editingPlato ? `✏️ Editar: ${editingPlato.nombre}` : '➕ Guardar plato en el catálogo'}
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
          <label className="form-label">Nombre del plato *</label>
          <input
            type="text"
            className="form-input"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Bandeja Paisa Especial"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción o ingredientes clave</label>
          <textarea
            className="form-textarea"
            value={form.descripcion_base}
            onChange={(e) => setForm((f) => ({ ...f, descripcion_base: e.target.value }))}
            placeholder="Ej: Con carne asada, chicharrón crocante, arroz, frijol..."
            style={{ minHeight: 80 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Emojis representativos</label>
          <input
            type="text"
            className="form-input"
            value={form.emojis_ingredientes}
            onChange={(e) => setForm((f) => ({ ...f, emojis_ingredientes: e.target.value }))}
            placeholder="🥩🍚🫘🥚🥑"
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Precio base ($)</label>
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
  onRefresh,
  toast,
}: {
  pizarraActiva: PizarraItem[];
  config: RestauranteConfig | null;
  onRefresh: () => void;
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
    const nombre_restaurante = config?.nombre ?? 'Restaurante Áarstova';
    const local = config?.local ?? '';
    const whatsapp = config?.whatsapp_principal ?? '';
    const telefono = config?.telefono_fijo ?? '';

    let msg = '';
    if (frase) msg += `🎶 "${frase}"\n`;
    if (autorFrase) msg += `— *${autorFrase}*\n\n`;
    if (nombreChef) msg += `*${nombreChef}* 🧑🏻‍🍳\n\n`;

    msg += `📋 *MENÚ DEL DÍA*\n\n`;

    pizarraActiva.forEach((item) => {
      if (!item.plato) return;
      msg += `☄️ *${item.plato.nombre}*\n`;
      if (item.plato.emojis_ingredientes) msg += `${item.plato.emojis_ingredientes}\n`;
      if (item.plato.descripcion_base) msg += `_${item.plato.descripcion_base}_\n`;
      msg += `💲 *${formatCOP(item.precio_hoy)}*\n\n`;
    });

    if (costo > 0) {
      msg += `🍶🍱💲${formatCOP(costo)} *adicionales (Empaque Termoformado)*\n\n`;
    }

    msg += `*${nombre_restaurante}*\n🏤 `;
    if (local) msg += `*${local}*\n`;
    if (whatsapp) msg += `📲 *${whatsapp}*\n`;
    if (telefono) msg += `☎️ *${telefono}*\n`;
    msg += `*Servicio a domicilio* 🏍️`;

    return msg;
  };

  const mensajeGenerado = generarMensaje();

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensajeGenerado);
      toast('Mensaje del menú copiado al portapapeles', 'success');
    } catch {
      toast('Copia el texto del recuadro manualmente.', 'error');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="section-title" style={{ margin: 0 }}>Parámetros del Mensaje</span>
          <button className="btn btn-neutral btn-sm" onClick={onRefresh}>
            🔄 Sincronizar Platos Activos
          </button>
        </div>

        {/* Frase del día */}
        <div className="form-group">
          <label className="form-label">Frase del día</label>
          <textarea
            className="form-textarea"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder="Escribe o genera una frase inspiradora…"
            style={{ minHeight: 70 }}
          />
          <button
            className="btn btn-neutral btn-sm"
            onClick={getFraseAleatoria}
            disabled={loadingFrase}
            style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }}
          >
            {loadingFrase ? '⏳' : '🎲'} Cambiar Frase Aleatoria
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
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
            <label className="form-label">Nombre del Chef</label>
            <input
              type="text"
              className="form-input"
              value={nombreChef}
              onChange={(e) => setNombreChef(e.target.value)}
              placeholder="Ej: Chef Carlos"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Costo Empaque ($)</label>
            <input
              type="number"
              className="form-input"
              value={costoEmpaque}
              onChange={(e) => setCostoEmpaque(e.target.value)}
              min={0}
              step={500}
            />
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div>
        <div className="section-title">Vista previa para WhatsApp ({pizarraActiva.length} platos incluidos)</div>
        <div className="nm-card" style={{ background: '#FFFDF9', borderLeft: '4px solid #25D366' }}>
          <textarea
            className="form-textarea"
            readOnly
            value={mensajeGenerado}
            style={{
              minHeight: 260,
              fontFamily: 'var(--font-ui)',
              fontSize: '0.9rem',
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              resize: 'vertical',
              padding: 0,
              width: '100%',
              lineHeight: 1.5,
            }}
          />
        </div>
      </div>

      {pizarraActiva.length === 0 && (
        <div className="nm-card" style={{ textAlign: 'center', color: 'var(--orange-dark)', padding: 'var(--space-4)' }}>
          ⚠️ No tienes platos activos en la Pizarra del Día. Activa tus platos en la primera pestaña para verlos en el mensaje.
        </div>
      )}

      {/* Botones */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-success" onClick={handleCopiar} style={{ flex: 1, minWidth: 200, padding: '12px' }}>
          📋 Copiar para WhatsApp
        </button>
        <button
          className="btn btn-primary"
          onClick={handleGuardar}
          disabled={saving}
          style={{ flex: 1, minWidth: 200, padding: '12px' }}
        >
          {saving ? '⏳ Guardando…' : '💾 Guardar Mensaje del Día'}
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

  const isMesero = sesion?.usuario?.rol === 'mesero';
  const canEdit = !isMesero && sesion?.permisos.menu_editar === true;
  const canWhatsApp = !isMesero && sesion?.permisos.menu_whatsapp === true;

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
    { id: 'pizarra', label: 'Pizarra del Día (Consulta)', icon: '📋', visible: true },
    { id: 'banco', label: 'Banco de Platos', icon: '🍽️', visible: !isMesero },
    { id: 'whatsapp', label: 'Generador WhatsApp', icon: '💬', visible: canWhatsApp },
  ];

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <h1>🍽️ Gestión del Menú</h1>
          <div className="page-subtitle">
            Activa la carta de hoy, administra el catálogo completo de platos y genera mensajes para WhatsApp.
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
          onRefresh={fetchAll}
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
          onRefresh={fetchAll}
          toast={toast}
        />
      )}
    </>
  );
}
