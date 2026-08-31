'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Cliente } from '@/lib/types';

interface ClienteSearchPickerProps {
  clientes: Cliente[];
  selectedClienteId?: string;
  onSelectCliente: (cliente: Cliente | null) => void;
  onClear?: () => void;
}

export function ClienteSearchPicker({
  clientes,
  selectedClienteId,
  onSelectCliente,
  onClear,
}: ClienteSearchPickerProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCliente = clientes.find((c) => c.id === selectedClienteId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = clientes.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const nombre = (c.nombre || '').toLowerCase();
    const tel = (c.telefono || '').toLowerCase();
    const barrio = (c.barrio || '').toLowerCase();
    const dir = (c.direccion || '').toLowerCase();
    return nombre.includes(q) || tel.includes(q) || barrio.includes(q) || dir.includes(q);
  });

  const handleSelect = (cliente: Cliente) => {
    onSelectCliente(cliente);
    setQuery('');
    setIsOpen(false);
  };

  const handleRemove = () => {
    onSelectCliente(null);
    if (onClear) onClear();
    setQuery('');
  };

  if (selectedCliente) {
    return (
      <div
        className="nm-card"
        style={{
          background: 'var(--green-muted, #E8F5E9)',
          borderLeft: '4px solid var(--green, #4CAF50)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <div>
          <span style={{ fontWeight: 800, color: 'var(--green-dark, #2E7D32)', display: 'block', fontSize: '0.92rem' }}>
            ✅ Cliente Seleccionado: {selectedCliente.nombre}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #666)' }}>
            📞 {selectedCliente.telefono || 'Sin tel'} {selectedCliente.barrio ? `| 🏘️ ${selectedCliente.barrio}` : ''} {selectedCliente.direccion ? `| 📍 ${selectedCliente.direccion}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={handleRemove}
          title="Quitar cliente seleccionado"
          style={{ color: 'var(--status-cancel, #d32f2f)', fontWeight: 700 }}
        >
          ✕ Quitar
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <label className="form-label">🔎 Buscar Cliente Registrado (Nombre, Teléfono o Barrio)</label>
      <input
        type="text"
        className="form-input"
        placeholder="Escribe para buscar... (ej: Carlos, 300, Centro)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        style={{ width: '100%' }}
      />

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 999,
            maxHeight: '240px',
            overflowY: 'auto',
            background: 'var(--bg-elevated, #fff)',
            border: '1px solid var(--border, #ccc)',
            borderRadius: 'var(--border-radius-md, 8px)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
            marginTop: '4px',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted, #666)', textAlign: 'center' }}>
              No se encontraron clientes coincidentes con &quot;{query}&quot;. Escribe abajo para registrarlo.
            </div>
          ) : (
            filtered.slice(0, 30).map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelect(c)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-light, #eee)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-raised, #f5f5f5)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #111)' }}>{c.nombre}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #666)' }}>
                  📞 {c.telefono || 'Sin teléfono'} {c.barrio ? ` — 🏘️ Barrio: ${c.barrio}` : ''} {c.direccion ? ` — 📍 ${c.direccion}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
