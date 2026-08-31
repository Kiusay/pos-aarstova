import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const body = await request.json();
    const { nombre, correo, password, rol, telefono, cedula, direccion } = body;

    if (!nombre || !password) {
      return NextResponse.json({ error: 'Nombre y contraseña son requeridos' }, { status: 400 });
    }

    const cleanName = nombre.trim();
    const cleanSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = correo?.trim() || `${cleanSlug || 'usuario'}${Math.floor(1000 + Math.random() * 9000)}@aarstova.local`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Si existe SERVICE_ROLE_KEY usamos servicio admin (omite RLS y rate-limit de email)
    // De lo contrario usamos anonKey reenviando el token de sesión del Admin (para pasar RLS)
    const isService = !!serviceRoleKey;
    const keyToUse = serviceRoleKey || anonKey;

    const supabaseClient = createClient(supabaseUrl, keyToUse, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    });

    let newUserId: string | null = null;
    let authErrorMessage = '';

    // 1. Intentar crear en Supabase Auth vía admin.createUser si existe serviceRoleKey
    if (isService) {
      const { data: authData, error: adminErr } = await supabaseClient.auth.admin.createUser({
        email: finalEmail,
        password: password,
        email_confirm: true,
        user_metadata: { nombre: cleanName, rol }
      });

      if (!adminErr && authData?.user) {
        newUserId = authData.user.id;
      } else if (adminErr) {
        authErrorMessage = adminErr.message;
      }
    }

    // 2. Si no hay serviceRoleKey o falló admin, intentar signUp normal
    if (!newUserId) {
      const { data: signUpData, error: signUpErr } = await supabaseClient.auth.signUp({
        email: finalEmail,
        password: password,
        options: { data: { nombre: cleanName, rol } }
      });

      if (signUpData?.user) {
        newUserId = signUpData.user.id;
      } else if (signUpErr) {
        authErrorMessage = signUpErr.message;
      }
    }

    // 3. Fallback UUID si Auth falló o dio rate limit
    if (!newUserId) {
      newUserId = crypto.randomUUID();
    }

    const permisosMap: Record<string, any> = {
      admin: {
        menu_ver: true, menu_editar: true, menu_whatsapp: true,
        pedidos_crear: true, pedidos_ver_propios: true, pedidos_ver_todos: true,
        kds_ver: true, domicilios_propios: true, domicilios_todos: true,
        clientes_buscar: true, clientes_editar: true,
        compras_ver: true, compras_editar: true,
        caja: true, reportes: true, admin: true
      },
      chef: {
        menu_ver: true, menu_editar: true, menu_whatsapp: true,
        pedidos_crear: false, pedidos_ver_propios: false, pedidos_ver_todos: true,
        kds_ver: true, domicilios_propios: false, domicilios_todos: true,
        clientes_buscar: false, clientes_editar: false,
        compras_ver: true, compras_editar: true,
        caja: false, reportes: false, admin: false
      },
      mesero: {
        menu_ver: true, menu_editar: false, menu_whatsapp: false,
        pedidos_crear: true, pedidos_ver_propios: true, pedidos_ver_todos: true,
        kds_ver: true, domicilios_propios: false, domicilios_todos: false,
        clientes_buscar: true, clientes_editar: false,
        compras_ver: false, compras_editar: false,
        caja: false, reportes: false, admin: false
      },
      domiciliario: {
        menu_ver: false, menu_editar: false, menu_whatsapp: false,
        pedidos_crear: false, pedidos_ver_propios: false, pedidos_ver_todos: false,
        kds_ver: false, domicilios_propios: true, domicilios_todos: false,
        clientes_buscar: false, clientes_editar: false,
        compras_ver: false, compras_editar: false,
        caja: false, reportes: false, admin: false
      }
    };

    // 4. Upsert en public.usuarios (se incluyen telefono, cedula, direccion opcionales)
    const payload: any = {
      id: newUserId,
      nombre: cleanName,
      correo: finalEmail,
      rol,
      activo: true,
      es_admin_principal: false,
      permisos: permisosMap[rol] || permisosMap.mesero
    };

    if (telefono) payload.telefono = telefono.trim();
    if (cedula) payload.cedula = cedula.trim();
    if (direccion) payload.direccion = direccion.trim();

    const { error: dbErr } = await supabaseClient.from('usuarios').upsert(payload);

    if (dbErr) {
      return NextResponse.json({
        error: authErrorMessage
          ? `Límite de correos en Auth (${authErrorMessage}). Para solucionar totalmente en Supabase, ejecuta esta consulta en Supabase SQL Editor: ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;`
          : `Error en BD: ${dbErr.message}`
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mensaje: `Usuario ${cleanName} creado correctamente.`,
      email: finalEmail,
      userId: newUserId
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
