const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CATEGORIAS = [
  { nombre: 'Platos del día',   color: '#d97706' },
  { nombre: 'Sopas',            color: '#dc2626' },
  { nombre: 'Entradas',         color: '#ea580c' },
  { nombre: 'Bebidas calientes',color: '#92400e' },
  { nombre: 'Bebidas frías',    color: '#0891b2' },
  { nombre: 'Postres',          color: '#db2777' },
];

const PRODUCTOS = {
  'Platos del día': [
    { nombre: 'Bandeja paisa',           pc: 12000, pv: 25000, stock: 18 },
    { nombre: 'Ajiaco santafereño',      pc: 11000, pv: 24000, stock: 15 },
    { nombre: 'Sancocho de gallina',     pc: 10000, pv: 22000, stock: 12 },
    { nombre: 'Frijoles con chicharrón', pc:  9000, pv: 18000, stock: 20 },
    { nombre: 'Pechuga a la plancha',    pc:  9500, pv: 20000, stock: 14 },
    { nombre: 'Sobrebarriga al horno',   pc: 13000, pv: 26000, stock:  8 },
    { nombre: 'Lomo de cerdo',           pc: 11500, pv: 23000, stock: 10 },
    { nombre: 'Trucha al ajillo',        pc: 14000, pv: 28000, stock:  6 },
  ],
  'Sopas': [
    { nombre: 'Sopa de costilla',  pc: 6500,  pv: 14000, stock: 12 },
    { nombre: 'Caldo de costilla', pc: 5500,  pv: 12000, stock: 15 },
    { nombre: 'Crema de auyama',   pc: 4500,  pv: 10000, stock:  8 },
  ],
  'Entradas': [
    { nombre: 'Mazorca con queso',   pc: 3500, pv: 8000,  stock: 22 },
    { nombre: 'Patacones con hogao', pc: 3000, pv: 7500,  stock: 18 },
    { nombre: 'Empanada de carne',   pc: 1200, pv: 3500,  stock: 60, min: 20 },
  ],
  'Bebidas calientes': [
    { nombre: 'Café tinto',              pc: 600,  pv: 2500, stock: 80, min: 30 },
    { nombre: 'Café con leche',          pc: 900,  pv: 3500, stock: 50, min: 20 },
    { nombre: 'Aromática',               pc: 500,  pv: 3000, stock: 40, min: 15 },
    { nombre: 'Agua de panela con queso',pc: 1500, pv: 5000, stock: 25 },
    { nombre: 'Chocolate caliente',      pc: 1200, pv: 4000, stock: 30 },
  ],
  'Bebidas frías': [
    { nombre: 'Limonada natural',  pc: 1500, pv: 5000, stock: 40, min: 15 },
    { nombre: 'Limonada de coco',  pc: 2500, pv: 7000, stock:  4, min: 10 },  // stock bajo a propósito
    { nombre: 'Jugo de mora',      pc: 2000, pv: 5500, stock: 30 },
    { nombre: 'Jugo de mango',     pc: 2000, pv: 5500, stock: 28 },
    { nombre: 'Gaseosa personal',  pc: 2200, pv: 4500, stock: 48, min: 20 },
    { nombre: 'Cerveza nacional',  pc: 2800, pv: 5000, stock: 36, min: 12 },
    { nombre: 'Agua botella 500ml',pc:  800, pv: 3000, stock:  0, min: 20 },  // agotado a propósito
  ],
  'Postres': [
    { nombre: 'Tres leches porción',   pc: 3000, pv: 7000, stock: 14 },
    { nombre: 'Arequipe con queso',    pc: 2500, pv: 6000, stock: 10 },
    { nombre: 'Brevas con arequipe',   pc: 3500, pv: 7500, stock:  8 },
    { nombre: 'Postre de natas',       pc: 2800, pv: 6500, stock:  6 },
  ],
};

(async () => {
  const { data: { users } } = await admin.auth.admin.listUsers();
  const user = users.find(u => u.email === 'preview@mostrador.test');
  if (!user) { console.log('X user preview@mostrador.test no existe'); process.exit(1); }
  const { data: usuario } = await admin.from('usuarios').select('empresa_id').eq('id', user.id).single();
  if (!usuario?.empresa_id) { console.log('X user no tiene empresa'); process.exit(1); }
  const empresaId = usuario.empresa_id;

  await admin.from('productos').delete().eq('empresa_id', empresaId);
  await admin.from('categorias').delete().eq('empresa_id', empresaId);
  await admin.from('empresas').update({ nombre: 'Restaurante Doña Pacha' }).eq('id', empresaId);

  const { data: cats, error: catErr } = await admin
    .from('categorias')
    .insert(CATEGORIAS.map(c => ({ ...c, empresa_id: empresaId })))
    .select('id, nombre');
  if (catErr) { console.log('X categorias:', catErr.message); process.exit(1); }

  const catMap = Object.fromEntries(cats.map(c => [c.nombre, c.id]));
  let count = 0;
  for (const [catNombre, prods] of Object.entries(PRODUCTOS)) {
    for (const p of prods) {
      const slug = p.nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase().slice(0, 10);
      const sku = `${slug}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { error } = await admin.from('productos').insert({
        empresa_id: empresaId,
        categoria_id: catMap[catNombre],
        nombre: p.nombre,
        sku,
        precio_compra: p.pc,
        precio_venta: p.pv,
        stock_actual: p.stock,
        stock_minimo: p.min ?? 5,
        activo: true,
      });
      if (error) console.log('X', p.nombre, error.message);
      else count++;
    }
  }
  console.log(`OK Restaurante Doña Pacha: ${cats.length} categorías y ${count} productos`);
})();
