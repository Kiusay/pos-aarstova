import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { usuarioInput, password } = await request.json();

    if (!usuarioInput || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña son requeridos' }, { status: 400 });
    }

    const cleanInput = usuarioInput.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Usar serviceRoleKey si está configurado para ignorar RLS en la búsqueda inicial
    const keyToUse = serviceRoleKey || anonKey;
    const supabaseClient = createClient(supabaseUrl, keyToUse, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 1. Buscar en public.usuarios (coincidencia por alias, correo o nombre completo)
    let userRow: any = null;

    if (cleanInput.includes('@')) {
      const { data } = await supabaseClient
        .from('usuarios')
        .select('*')
        .eq('correo', cleanInput)
        .maybeSingle();
      userRow = data;
    } else {
      // Coincidencia exacta o parcial ignorando mayúsculas/minúsculas
      const { data: exact } = await supabaseClient
        .from('usuarios')
        .select('*')
        .ilike('nombre', cleanInput)
        .maybeSingle();
      userRow = exact;

      if (!userRow) {
        const { data: fuzzy } = await supabaseClient
          .from('usuarios')
          .select('*')
          .ilike('nombre', `%${cleanInput}%`);
        if (fuzzy && fuzzy.length > 0) userRow = fuzzy[0];
      }

      if (!userRow) {
        const { data: full } = await supabaseClient
          .from('usuarios')
          .select('*')
          .ilike('nombre_completo', `%${cleanInput}%`);
        if (full && full.length > 0) userRow = full[0];
      }
    }

    if (!userRow) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 400 });
    }

    if (!userRow.activo) {
      return NextResponse.json({ error: 'Este usuario se encuentra inactivo. Contacta al administrador.' }, { status: 403 });
    }

    const targetEmail = userRow.correo || `${cleanInput.toLowerCase().replace(/[^a-z0-9]/g, '')}@aarstova.local`;

    // 2. Validar credenciales probando inicio de sesión con Supabase Auth sin sobreescribir la clave
    const authVerifyClient = createClient(supabaseUrl, anonKey);
    const { error: authErr } = await authVerifyClient.auth.signInWithPassword({
      email: targetEmail,
      password: password,
    });

    if (authErr) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      email: targetEmail
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor de autenticación' }, { status: 500 });
  }
}
