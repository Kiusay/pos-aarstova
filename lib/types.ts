// ============================================================
// TIPOS GLOBALES — POS Áarstova
// ============================================================

export type Rol = 'admin' | 'chef' | 'mesero' | 'domiciliario';

export type EstadoPedido =
  | 'pendiente' | 'preparacion' | 'listo'
  | 'en_camino' | 'entregado'  | 'cancelado';

export type EstadoPago = 'pendiente_pago' | 'pagado' | 'fiado';

export type EstadoItem = 'enviado_cocina' | 'en_preparacion' | 'servido';

export type EstadoMesa = 'libre' | 'ocupada' | 'esperando_cuenta';

export type CategoriasGasto =
  | 'insumos' | 'empaque' | 'servicios'
  | 'personal' | 'mantenimiento' | 'otro';

export type UnidadCompra =
  | 'kg' | 'gramos' | 'litros' | 'ml'
  | 'unidades' | 'bolsas' | 'cajas' | 'otro';

export type CategoriaCompra =
  | 'frutas_verduras' | 'carnes' | 'bebidas'
  | 'empaque' | 'limpieza' | 'condimentos' | 'otro';

// ─── Permisos ────────────────────────────────────────────────
export interface Permisos {
  menu_ver:           boolean;
  menu_editar:        boolean;
  menu_whatsapp:      boolean;
  pedidos_crear:      boolean;
  pedidos_ver_propios:boolean;
  pedidos_ver_todos:  boolean;
  kds_ver:            boolean;
  domicilios_propios: boolean;
  domicilios_todos:   boolean;
  clientes_buscar:    boolean;
  clientes_editar:    boolean;
  compras_ver:        boolean;
  compras_editar:     boolean;
  caja:               boolean;
  reportes:           boolean;
  admin:              boolean;
}

// ─── Entidades ───────────────────────────────────────────────
export interface RestauranteConfig {
  id:                       string;
  nombre:                   string;
  slogan:                   string | null;
  logo_url:                 string | null;
  whatsapp_principal:       string | null;
  direccion:                string | null;
  local:                    string | null;
  telefono_fijo:            string | null;
  cuentas_bancarias:        CuentaBancaria[];
  impresora_termica_activa: boolean;
  tiempo_limite_cocina_min: number;
  costo_domicilio_zonas:    ZonaDomicilio[];
  pie_factura_texto:        string | null;
  created_at:               string;
}

export interface CuentaBancaria {
  banco:    string;  // Nequi, Daviplata, Bancolombia...
  numero:   string;
  titular:  string;
  tipo:     string;  // 'billetera' | 'cuenta_ahorros' | 'cuenta_corriente'
}

export interface ZonaDomicilio {
  zona:   string;
  barrio: string;
  costo:  number;
}

export interface Usuario {
  id:                 string;
  nombre:             string;
  correo:             string;
  rol:                Rol;
  activo:             boolean;
  es_admin_principal: boolean;
  permisos:           Permisos;
  avatar_url:         string | null;
  created_at:         string;
}

export interface CategoriaMenu {
  id:     string;
  nombre: string;
  emoji:  string;
  orden:  number;
  activa: boolean;
}

export interface Plato {
  id:                 string;
  categoria_id:       string | null;
  nombre:             string;
  descripcion_base:   string | null;
  emojis_ingredientes:string;
  precio_base:        number;
  foto_url:           string | null;
  activo_permanente:  boolean;
  created_at:         string;
  // Relaciones
  categoria?:         CategoriaMenu;
}

export interface PizarraItem {
  id:          string;
  plato_id:    string;
  fecha:       string;
  precio_hoy:  number;
  disponibles: number | null;
  vendidos:    number;
  activo:      boolean;
  nota_dia:    string | null;
  creado_por:  string | null;
  created_at:  string;
  // Relaciones
  plato?:      Plato;
}

export interface MensajeDia {
  id:               string;
  fecha:            string;
  frase:            string | null;
  autor_frase:      string | null;
  nombre_chef:      string | null;
  costo_empaque:    number;
  incluir_logo:     boolean;
  mensaje_generado: string | null;
  creado_por:       string | null;
  updated_at:       string;
}

export interface Cliente {
  id:                 string;
  nombre:             string;
  telefono:           string;
  direccion:          string | null;
  barrio:             string | null;
  notas_preferencias: string | null;
  notas_entrega:      string | null;
  activo:             boolean;
  created_at:         string;
  updated_at:         string;
}

export interface Mesa {
  id:        string;
  numero:    number;
  nombre:    string | null;
  capacidad: number;
  estado:    EstadoMesa;
  activa:    boolean;
}

export interface Pedido {
  id:                       string;
  numero_pedido:            number;
  tipo:                     'mesa' | 'domicilio';
  mesa_id:                  string | null;
  mesa_origen_id:           string | null;
  cliente_id:               string | null;
  cliente_nombre_rapido:    string | null;
  cliente_telefono_rapido:  string | null;
  domiciliario_id:          string | null;
  estado:                   EstadoPedido;
  estado_pago:              EstadoPago;
  num_comensales:           number;
  subtotal:                 number;
  descuento_tipo:           'porcentaje' | 'monto' | null;
  descuento_valor:          number;
  costo_domicilio:          number;
  total:                    number;
  propina:                  number;
  monto_efectivo:           number;
  monto_transferencia:      number;
  cuenta_destino:           string | null;
  notas_generales:          string | null;
  creado_por:               string | null;
  turno_id:                 string | null;
  fecha_creacion:           string;
  fecha_listo:              string | null;
  fecha_entregado:          string | null;
  motivo_cancelacion:       string | null;
  // Relaciones
  mesa?:                    Mesa;
  cliente?:                 Cliente;
  domiciliario?:            Usuario;
  detalle?:                 DetallePedido[];
}

export interface DetallePedido {
  id:              string;
  pedido_id:       string;
  plato_id:        string;
  ronda:           number;
  estado_item:     EstadoItem;
  cantidad:        number;
  modificaciones:  string | null;
  precio_unitario: number;
  subtotal:        number;
  // Relaciones
  plato?:          Plato;
}

export interface TurnoCaja {
  id:                      string;
  abierto_por:             string | null;
  cerrado_por:             string | null;
  base_inicial:            number;
  fecha_apertura:          string;
  fecha_cierre:            string | null;
  total_efectivo_sistema:  number | null;
  total_efectivo_contado:  number | null;
  diferencia:              number | null;
  total_transferencias:    number | null;
  total_gastos:            number | null;
  total_ventas:            number | null;
  estado:                  'abierto' | 'cerrado';
  notas_cierre:            string | null;
  // Relaciones
  abierto_por_usuario?:    Usuario;
}

export interface GastoCaja {
  id:             string;
  turno_id:       string | null;
  descripcion:    string;
  categoria:      CategoriasGasto;
  monto:          number;
  registrado_por: string | null;
  fecha:          string;
}

export interface ItemCompra {
  id:               string;
  insumo:           string;
  cantidad:         number | null;
  unidad:           UnidadCompra;
  categoria:        CategoriaCompra;
  urgente:          boolean;
  completado:       boolean;
  registrado_por:   string | null;
  fecha_registro:   string;
  fecha_completado: string | null;
  // Relaciones
  registrado_por_usuario?: Pick<Usuario, 'id' | 'nombre'>;
}

// ─── Quote (frases motivacionales) ───────────────────────────
export interface Quote {
  id:        number;
  frase:     string;
  autor:     string;
  categoria: string;
}

// ─── Contexto de sesión ───────────────────────────────────────
export interface SesionUsuario {
  usuario: Usuario;
  permisos: Permisos;
  tienePermiso: (permiso: keyof Permisos) => boolean;
}
