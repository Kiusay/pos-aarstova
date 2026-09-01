'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Usuario, Permisos, SesionUsuario } from '@/lib/types';

const ADMIN_PERMISOS: Permisos = {
  menu_ver: true, menu_editar: true, menu_whatsapp: true,
  pedidos_crear: true, pedidos_ver_propios: true, pedidos_ver_todos: true,
  kds_ver: true, domicilios_propios: true, domicilios_todos: true,
  clientes_buscar: true, clientes_editar: true,
  compras_ver: true, compras_editar: true,
  caja: true, reportes: true, admin: true
};

const SesionContext = createContext<SesionUsuario | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const cargarUsuario = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setSesion(null);
          setLoading(false);
          return;
        }

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (usuario) {
          const permisos = (usuario.permisos as Permisos) || ADMIN_PERMISOS;
          setSesion({
            usuario: usuario as Usuario,
            permisos,
            tienePermiso: (permiso) => {
              if (permiso === 'domicilios_propios' && ['admin', 'staff', 'mesero', 'domiciliario'].includes(usuario.rol)) {
                return true;
              }
              return permisos[permiso] === true;
            },
          });
        } else {
          // Fallback para administrador inicial si aun no existe fila en usuarios
          const fallbackUsuario: Usuario = {
            id: user.id,
            nombre: user.user_metadata?.nombre || splitEmailName(user.email),
            correo: user.email || '',
            rol: 'admin',
            activo: true,
            es_admin_principal: true,
            permisos: ADMIN_PERMISOS,
            avatar_url: null,
            created_at: new Date().toISOString()
          };

          // Intentar guardar en la base de datos para que RLS y FKs funcionen perfectamente
          try {
            await supabase.from('usuarios').upsert(fallbackUsuario);
          } catch (e) {
            console.warn('Could not auto-create user in public.usuarios:', e);
          }

          setSesion({
            usuario: fallbackUsuario,
            permisos: ADMIN_PERMISOS,
            tienePermiso: () => true
          });
        }
      } catch (err) {
        console.error('Error cargando sesión:', err);
      } finally {
        setLoading(false);
      }
    };

    cargarUsuario();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        if (!session) {
          setSesion(null);
          setLoading(false);
        } else {
          cargarUsuario();
        }
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

function splitEmailName(email?: string) {
  if (!email) return 'Usuario';
  return email.split('@')[0];
}

export function useSesion() {
  return useContext(SesionContext);
}

export function useSesionRequerida() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesionRequerida debe usarse dentro de SesionProvider');
  return ctx;
}
