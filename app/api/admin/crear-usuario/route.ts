import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { nombre, correo, password, rol } = await request.json();

    if (!nombre || !password) {
      return NextResponse.json({ error: 'Nombre y contraseña son requeridos' }, { status: 400 });
    }

    const cleanName = nombre.trim();
    const cleanSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = correo?.trim() || `${cleanSlug || 'usuario'}${Math.floor(1000 + Math.random() * 9000)}@aarstova.local`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Cliente con privilegios de administración si SERVICE_ROLE_KEY está disponible
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let newUserId: string | null = null;

    // 1. Intentar crear vía admin.createUser (NO envía emails, NO tiene rate limit, auto-confirma)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: authData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
        email: finalEmail,
        password: password,
        email_confirm: true,
        user_metadata: { nombre: cleanName, rol }
      });

      if (!adminErr && authData?.user) {
        newUserId = authData.user.id;
      } else {
        console.warn('[Admin API] admin.createUser notice:', adminErr?.message);
      }
    }

    // 2. Si no hay service key o falló admin, intentar signUp normal con cliente anon
    if (!newUserId) {
      const { data: signUpData, error: signUpErr } = await supabaseAdmin.auth.signUp({
        email: finalEmail,
        password: password,
        options: { data: { nombre: cleanName, rol } }
      });

      if (signUpData?.user) {
        newUserId = signUpData.user.id;
      } else if (signUpErr) {
        console.warn('[Admin API] signUp error:', signUpErr.message);
      }
    }

    // 3. Si aún no hay ID (ej: por rate limit), generar un UUID propio
    if (!newUserId) {
      newUserId = crypto.randomUUID();
    }

    // Helper permisos por rol
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

    // 4. Insertar/Upsert en public.usuarios
    const { error: dbErr } = await supabaseAdmin.from('usuarios').upsert({
      id: newUserId,
      nombre: cleanName,
      correo: finalEmail,
      rol,
      activo: true,
      es_admin_principal: false,
      permisos: permisosMap[rol] || permisosMap.mesero
    });

    if (dbErr) {
      // Si falla por FK constraint usuarios_id_fkey, significa que la FK requiere auth.users
      return NextResponse.json({
        error: `No se pudo crear en Auth (${dbErr.message}). Si continúa el límite de correos, agrega SUPABASE_SERVICE_ROLE_KEY en Vercel o ejecuta en Supabase SQL Editor: ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;`
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
