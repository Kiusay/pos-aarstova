import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const [key, val] = line.split('=');
    if (key && val) {
      process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, '');
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: usuarios, error } = await supabase.from('usuarios').select('*');
  if (error) {
    console.error('Error fetching usuarios:', error);
    return;
  }

  console.log(`Found ${usuarios.length} total users in DB.`);
  for (const u of usuarios) {
    console.log(`- User: ${u.nombre} (Rol: ${u.rol})`);
    let p = u.permisos || {};
    if (u.rol === 'mesero' || u.rol === 'staff' || u.rol === 'admin' || u.rol === 'domiciliario') {
      p.domicilios_propios = true;
      p.clientes_buscar = true;
      const { error: updateErr } = await supabase
        .from('usuarios')
        .update({ permisos: p })
        .eq('id', u.id);
      if (updateErr) {
        console.error(`Error updating user ${u.nombre}:`, updateErr);
      } else {
        console.log(`Updated permissions for ${u.nombre} (${u.rol}) -> domicilios_propios: true`);
      }
    }
  }
}

main();
