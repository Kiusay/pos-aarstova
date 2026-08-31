'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Usuario, Permisos, SesionUsuario } from '@/lib/types';

const SesionContext = createContext<SesionUsuario | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const cargarUsuario = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .single();

      if (usuario) {
        const permisos = usuario.permisos as Permisos;
        setSesion({
          usuario: usuario as Usuario,
          permisos,
          tienePermiso: (permiso) => permisos[permiso] === true,
        });
      }
      setLoading(false);
    };

    cargarUsuario();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        if (!session) { setSesion(null); setLoading(false); }
        else cargarUsuario();
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        gap: '12px',
        flexDirection: 'column',
      }}>
        <img src="/logo.png" alt="Áarstova" style={{ width: 120, opacity: 0.7 }} />
        <div className="skeleton" style={{ width: 160, height: 12, borderRadius: 6 }} />
      </div>
    );
  }

  return (
    <SesionContext.Provider value={sesion}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  return ctx;
}

export function useSesionRequerida() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesionRequerida debe usarse dentro de SesionProvider');
  return ctx;
}
