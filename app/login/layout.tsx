import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Ingresar — Restaurante Áarstova',
  description: 'Sistema POS Áarstova — Iniciar sesión',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
