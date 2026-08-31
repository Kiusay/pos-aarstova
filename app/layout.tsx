import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS Áarstova — Restaurante',
  description: 'Sistema de punto de venta para Restaurante Áarstova. Gestión de pedidos, cocina, domicilios y caja.',
  keywords: ['restaurante', 'pos', 'punto de venta', 'áarstova'],
  robots: 'noindex, nofollow',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#EDE0CC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
