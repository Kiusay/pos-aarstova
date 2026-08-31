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

    // Cliente anon para consultar la BD
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false }
    });

    // 1. Buscar el usuario en public.usuarios por nombre (alias) o por correo
    let userRow: any = null;

    if (cleanInput.includes('@')) {
      const { data } = await supabaseAnon
        .from('usuarios')
        .select('*')
        .eq('correo', cleanInput)
        .maybeSingle();
      userRow = data;
    } else {
      const { data } = await supabaseAnon
        .from('usuarios')
        .select('*')
        .ilike('nombre', cleanInput)
        .maybeSingle();
      userRow = data;
    }

    if (!userRow) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 400 });
    }

    if (!userRow.activo) {
      return NextResponse.json({ error: 'Este usuario se encuentra inactivo. Contacta al administrador.' }, { status: 403 });
    }

    const targetEmail = userRow.correo || `${cleanInput.toLowerCase().replace(/[^a-z0-9]/g, '')}@aarstova.local`;

    // 2. Si tenemos serviceRoleKey, auto-provisionar / auto-sincronizar el usuario en Auth si no existía
    if (serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      // Verificar / actualizar en Auth
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userRow.id, {
        password: password,
        email_confirm: true
      });

      // Si no existe en Auth (creado durante el límite de correos previo), crearlo ahora en Auth
      if (updateErr && (updateErr.message.includes('User not found') || updateErr.message.includes('not found'))) {
        await supabaseAdmin.auth.admin.createUser({
          id: userRow.id,
          email: targetEmail,
          password: password,
          email_confirm: true,
          user_metadata: { nombre: userRow.nombre, rol: userRow.rol }
        });
      }
    }

    return NextResponse.json({
      success: true,
      email: targetEmail
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor de autenticación' }, { status: 500 });
  }
}
