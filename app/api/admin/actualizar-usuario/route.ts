import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const body = await request.json();
    const { userId, nombre, nombreCompleto, rol, password, telefono, cedula, direccion, activo } = body;

    if (!userId) {
      return NextResponse.json({ error: 'ID de usuario es requerido' }, { status: 400 });
    }

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

    const cleanUsername = nombre?.trim();
    const cleanSlug = cleanUsername ? cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const emailToUse = `${cleanSlug || 'usuario'}@aarstova.local`;

    // 1. Si se especificó una nueva contraseña y tenemos serviceRoleKey, actualizar/crear en Auth
    if (password && password.length >= 6) {
      if (isService) {
        // Intentar actualizar contraseña en Auth por ID
        const { error: updateAuthErr } = await supabaseClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true
        });

        // Si no existía en Auth (creado antes por rate limit), crearlo en Auth
        if (updateAuthErr && updateAuthErr.message.includes('User not found')) {
          await supabaseClient.auth.admin.createUser({
            id: userId,
            email: emailToUse,
            password,
            email_confirm: true,
            user_metadata: { nombre: cleanUsername, rol }
          });
        }
      }
    }

    // 2. Permisos por rol
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

    // 3. Actualizar en public.usuarios
    const updatePayload: any = {};
    if (cleanUsername) updatePayload.nombre = cleanUsername;
    if (rol) {
      updatePayload.rol = rol;
      updatePayload.permisos = permisosMap[rol] || permisosMap.mesero;
    }
    if (activo !== undefined) updatePayload.activo = activo;
    if (nombreCompleto !== undefined) updatePayload.nombre_completo = nombreCompleto.trim();
    if (telefono !== undefined) updatePayload.telefono = telefono.trim();
    if (cedula !== undefined) updatePayload.cedula = cedula.trim();
    if (direccion !== undefined) updatePayload.direccion = direccion.trim();

    // Intentar actualización completa
    let { error: dbErr } = await supabaseClient
      .from('usuarios')
      .update(updatePayload)
      .eq('id', userId);

    // Fallback si faltan columnas opcionales en la BD
    if (dbErr && (dbErr.message.includes('column') || dbErr.message.includes('schema cache'))) {
      delete updatePayload.nombre_completo;
      delete updatePayload.telefono;
      delete updatePayload.cedula;
      delete updatePayload.direccion;

      const retry = await supabaseClient
        .from('usuarios')
        .update(updatePayload)
        .eq('id', userId);
      dbErr = retry.error;
    }

    if (dbErr) {
      return NextResponse.json({ error: `Error al actualizar usuario: ${dbErr.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, mensaje: 'Usuario actualizado correctamente' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}
