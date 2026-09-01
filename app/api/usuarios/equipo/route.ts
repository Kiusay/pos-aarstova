import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const keyToUse = serviceRoleKey || anonKey;
    const supabaseClient = createClient(supabaseUrl, keyToUse, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Cargar todos los usuarios activos excepto administradores principales / rol admin
    const { data: usuarios, error } = await supabaseClient
      .from('usuarios')
      .select('id, nombre, nombre_completo, rol, activo, es_admin_principal')
      .neq('rol', 'admin')
      .eq('es_admin_principal', false)
      .eq('activo', true)
      .order('nombre');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ usuarios: usuarios || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
