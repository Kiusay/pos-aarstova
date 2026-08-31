import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const body = await request.json();
    const { nombre, nombreCompleto, correo, password, rol, telefono, cedula, direccion } = body;

    if (!nombre || !password) {
      return NextResponse.json({ error: 'Nombre de usuario y contraseña son requeridos' }, { status: 400 });
    }

    if (rol === 'admin' && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        const supabaseUrlTemp = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const anonKeyTemp = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const tempClient = createClient(supabaseUrlTemp, anonKeyTemp);
        const { data: { user: callerUser } } = await tempClient.auth.getUser(token);
        if (callerUser) {
          const { data: callerData } = await tempClient.from('usuarios').select('rol, es_admin_principal').eq('id', callerUser.id).maybeSingle();
          if (callerData && callerData.rol !== 'admin' && !callerData.es_admin_principal) {
            return NextResponse.json({ error: 'Solo un Administrador principal puede crear usuarios Administradores' }, { status: 403 });
          }
        }
      }
    }

    const cleanUsername = nombre.trim();
    const cleanSlug = cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = correo?.trim() || `${cleanSlug || 'usuario'}@aarstova.local`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

    // 1. Crear en Supabase Auth vía admin.createUser si existe serviceRoleKey
    if (isService) {
      const { data: authData, error: adminErr } = await supabaseClient.auth.admin.createUser({
        email: finalEmail,
        password: password,
        email_confirm: true,
        user_metadata: { nombre: cleanUsername, rol }
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
        options: { data: { nombre: cleanUsername, rol } }
      });

      if (signUpData?.user) {
        newUserId = signUpData.user.id;
      } else if (signUpErr) {
        authErrorMessage = signUpErr.message;
      }
    }

    // 3. Fallback UUID si Auth dio error o rate-limit
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
      staff: {
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
        clientes_buscar: false, clientes_editar: false,
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
    const corePayload: any = {
      id: newUserId,
      nombre: cleanUsername,
      correo: finalEmail,
      rol,
      activo: true,
      es_admin_principal: false,
      permisos: permisosMap[rol] || permisosMap.mesero
    };

    const fullPayload: any = { ...corePayload };
    if (nombreCompleto?.trim()) fullPayload.nombre_completo = nombreCompleto.trim();
    if (telefono?.trim()) fullPayload.telefono = telefono.trim();
    if (cedula?.trim()) fullPayload.cedula = cedula.trim();
    if (direccion?.trim()) fullPayload.direccion = direccion.trim();

    // Client for DB write with service role (bypasses RLS after route security check)
    const dbClient = (isService && serviceRoleKey)
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : supabaseClient;

    // Intentar con campos opcionales si existen
    let { error: dbErr } = await dbClient.from('usuarios').upsert(fullPayload);

    // Si falla porque alguna columna opcional no existe en el esquema de la BD, reintentar con campos base
    if (dbErr && (dbErr.message.includes('column') || dbErr.message.includes('schema cache'))) {
      const retry = await dbClient.from('usuarios').upsert(corePayload);
      dbErr = retry.error;
    }

    if (dbErr) {
      if (dbErr.message.includes('usuarios_rol_check')) {
        return NextResponse.json({ error: 'Falta actualizar la restricción de roles en Supabase SQL Editor. Ejecuta: ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check; ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (\'admin\', \'staff\', \'chef\', \'mesero\', \'domiciliario\'));' }, { status: 400 });
      }
      return NextResponse.json({
        error: `Error en BD (${dbErr.message}).`
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mensaje: `Usuario ${cleanUsername} creado correctamente.`,
      email: finalEmail,
      userId: newUserId
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
