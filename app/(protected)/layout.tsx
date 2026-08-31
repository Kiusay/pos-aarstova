'use client';

export const dynamic = 'force-dynamic';


import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { SesionProvider, useSesion } from '@/lib/sesion-context';

// ─── Definición de nav items ──────────────────────────────────
interface NavItem {
  href: string;
  label: string;
  icon: string;
  permiso?: string;
  alwaysShow?: boolean;
  seccion?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/',           label: 'Dashboard',   icon: '🏠', alwaysShow: true, seccion: 'principal' },
  { href: '/menu',       label: 'Menú',         icon: '🍽️', permiso: 'menu_ver', seccion: 'operacion' },
  { href: '/pedidos',    label: 'Pedidos',      icon: '📋', permiso: 'pedidos_crear', seccion: 'operacion' },
  { href: '/mesero',     label: 'Mesero',       icon: '🪑', permiso: 'pedidos_crear', seccion: 'operacion' },
  { href: '/cocina',     label: 'Cocina',       icon: '👨‍🍳', permiso: 'kds_ver', seccion: 'operacion' },
  { href: '/domicilios', label: 'Domicilios',   icon: '🛵', permiso: 'domicilios_propios', seccion: 'operacion' },
  { href: '/clientes',   label: 'Clientes',     icon: '👥', permiso: 'clientes_buscar', seccion: 'gestion' },
  { href: '/compras',    label: 'Compras',      icon: '🛒', permiso: 'compras_ver', seccion: 'gestion' },
  { href: '/caja',       label: 'Caja',         icon: '💰', permiso: 'caja', seccion: 'gestion' },
  { href: '/reportes',   label: 'Reportes',     icon: '📊', permiso: 'reportes', seccion: 'gestion' },
  { href: '/admin',      label: 'Admin',        icon: '⚙️', permiso: 'admin', seccion: 'sistema' },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/',           label: 'Inicio',    icon: '🏠', alwaysShow: true },
  { href: '/mesero',     label: 'Mesero',    icon: '🪑', permiso: 'pedidos_crear' },
  { href: '/pedidos',    label: 'Pedidos',   icon: '📋', permiso: 'pedidos_crear' },
  { href: '/cocina',     label: 'Cocina',    icon: '👨‍🍳', permiso: 'kds_ver' },
  { href: '/menu',       label: 'Menú',      icon: '🍽️', permiso: 'menu_ver' },
];

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const sesion = useSesion();
  const router = useRouter();
  const supabase = createClient();

  const tieneAcceso = (item: NavItem) => {
    if (item.alwaysShow) return true;
    if (!sesion || !item.permiso) return false;
    if (sesion.usuario?.rol === 'mesero' && item.href === '/clientes') return false;
    return sesion.permisos[item.permiso as keyof typeof sesion.permisos] === true;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const secciones: Record<string, { label: string; items: NavItem[] }> = {
    principal: { label: '', items: [] },
    operacion: { label: 'Operación', items: [] },
    gestion:   { label: 'Gestión', items: [] },
    sistema:   { label: 'Sistema', items: [] },
  };

  NAV_ITEMS.filter(tieneAcceso).forEach(item => {
    const s = item.seccion || 'principal';
    if (secciones[s]) secciones[s].items.push(item);
  });

  const iniciales = sesion?.usuario.nombre
    .split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <>
      {/* Overlay móvil */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${!isOpen ? 'sidebar--hidden' : ''}`} role="navigation" aria-label="Menú principal">
        {/* Logo */}
        <div className="sidebar-logo">
          <Image
            src="/logo.png"
            alt="Restaurante Áarstova"
            width={130}
            height={60}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Nav links */}
        <nav className="sidebar-nav">
          {Object.entries(secciones).map(([key, { label, items }]) => {
            if (items.length === 0) return null;
            return (
              <React.Fragment key={key}>
                {label && <div className="sidebar-nav-section">{label}</div>}
                {items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                    onClick={onClose}
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    <span className="nav-link__icon" aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer usuario */}
        <div className="sidebar-footer">
          {sesion && (
            <div className="user-card">
              <div className="user-avatar" aria-hidden="true">{iniciales}</div>
              <div className="user-card__info">
                <div className="user-card__name">{sesion.usuario.nombre}</div>
                <div className="user-card__role">{sesion.usuario.rol}</div>
              </div>
            </div>
          )}
          <button className="btn btn-ghost btn-sm btn-full" onClick={handleLogout}>
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Navbar top ───────────────────────────────────────────────
function Navbar({
  onMenuToggle,
  darkMode,
  onToggleDark,
}: {
  onMenuToggle: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find(n => n.href === pathname);

  return (
    <header className="navbar" role="banner">
      <button
        className="btn btn-icon btn-ghost menu-toggle"
        onClick={onMenuToggle}
        aria-label="Abrir menú"
        id="menu-toggle-btn"
      >
        ☰
      </button>

      <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
        {current?.icon} {current?.label || 'POS Áarstova'}
      </span>

      <button
        className="btn btn-icon btn-ghost"
        onClick={onToggleDark}
        aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={darkMode ? 'Modo claro' : 'Modo oscuro'}
        id="theme-toggle-btn"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>
    </header>
  );
}

// ─── Bottom nav (móvil) ───────────────────────────────────────
function BottomNav() {
  const pathname = usePathname();
  const sesion = useSesion();

  const items = BOTTOM_NAV_ITEMS.filter(item => {
    if (item.alwaysShow) return true;
    if (!sesion || !item.permiso) return false;
    return sesion.permisos[item.permiso as keyof typeof sesion.permisos] === true;
  }).slice(0, 5);

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegación rápida">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          <span className="bottom-nav-item__icon" aria-hidden="true">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

// ─── Layout inner (con acceso al contexto) ────────────────────
function LayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    setDarkMode(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  };

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <Navbar
          onMenuToggle={() => setSidebarOpen(prev => !prev)}
          darkMode={darkMode}
          onToggleDark={toggleDark}
        />

        <main
          className="main-content"
          style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
          id="main-content"
        >
          {children}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

// ─── Export: Layout protegido ─────────────────────────────────
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SesionProvider>
      <LayoutInner>{children}</LayoutInner>
    </SesionProvider>
  );
}
