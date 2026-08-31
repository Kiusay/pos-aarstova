'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/* ─── Inline spin keyframe injected once via a style tag ─── */
const spinCSS = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.login-spinner {
  animation: spin 0.8s linear infinite;
  display: inline-block;
  vertical-align: middle;
}

/* ── Page shell ── */
.login-shell {
  min-height: 100dvh;
  background: var(--bg-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
}

/* ── Logo block ── */
.login-logo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}
.login-logo-wrap img {
  width: 160px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(46,26,10,0.25));
}
.login-brand {
  font-size: clamp(1.25rem, 4vw, 1.6rem);
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

/* ── Card ── */
.login-card {
  width: 100%;
  max-width: 420px;
}

/* ── Form layout ── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ── Password wrapper (input + eye icon) ── */
.password-wrap {
  position: relative;
}
.password-wrap .form-input {
  padding-right: 48px;
}
.password-toggle {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: var(--space-1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-fast);
  border-radius: var(--border-radius-sm);
}
.password-toggle:hover { color: var(--text-secondary); }

/* ── Error message ── */
.login-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  background: #FEE2E2;
  border: 1px solid #FECACA;
  border-left: 3px solid var(--status-cancel);
  border-radius: var(--border-radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: 0.875rem;
  color: #991B1B;
  animation: fadeIn var(--transition-normal);
}
.login-error svg { flex-shrink: 0; margin-top: 1px; }

/* ── Submit area ── */
.login-submit {
  margin-top: var(--space-2);
}
`;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    let finalEmail = email.trim();

    // Si el usuario ingresó solo su nombre o alias sin '@', buscar su correo correspondiente
    if (!finalEmail.includes('@')) {
      try {
        const { data: userRow } = await supabase
          .from('usuarios')
          .select('correo')
          .ilike('nombre', finalEmail)
          .maybeSingle();

        if (userRow?.correo) {
          finalEmail = userRow.correo;
        } else {
          const cleanSlug = finalEmail.toLowerCase().replace(/[^a-z0-9]/g, '');
          finalEmail = `${cleanSlug}@aarstova.local`;
        }
      } catch (err) {
        const cleanSlug = finalEmail.toLowerCase().replace(/[^a-z0-9]/g, '');
        finalEmail = `${cleanSlug}@aarstova.local`;
      }
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: finalEmail,
      password,
    });

    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('Usuario/correo o contraseña incorrectos. Intenta de nuevo.');
      } else if (authError.message.toLowerCase().includes('email not confirmed')) {
        setError('El correo no ha sido confirmado. Puedes desactivar "Confirm email" en Supabase o crear el usuario desde el panel de Admin.');
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    router.push('/');
  }

  return (
    <>
      <style>{spinCSS}</style>

      <main className="login-shell animate-fadeIn">
        {/* ── Logo & brand ── */}
        <div className="login-logo-wrap">
          <img src="/logo.png" alt="Logo Restaurante Áarstova" />
          <h1 className="login-brand text-display">Restaurante Áarstova</h1>
        </div>

        {/* ── Card ── */}
        <div className="nm-card login-card">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email / Username */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Usuario o Correo electrónico
              </label>
              <input
                id="email"
                type="text"
                className="form-input"
                placeholder="Ej: pedro o tu@correo.com"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Contraseña
              </label>
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    /* Eye-off icon */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    /* Eye icon */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="login-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <div className="login-submit">
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg
                      className="login-spinner"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.3"/>
                      <path d="M12 2a10 10 0 0 1 10 10"/>
                    </svg>
                    Ingresando…
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-muted" style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
          Sistema POS Áarstova © {new Date().getFullYear()}
        </p>
      </main>
    </>
  );
}
