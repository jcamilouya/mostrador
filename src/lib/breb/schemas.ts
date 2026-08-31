import { z } from 'zod';

export const BANCOS_COLOMBIA = [
  'Bancolombia',
  'Davivienda',
  'BBVA',
  'Banco de Bogotá',
  'Nequi',
  'Daviplata',
  'Banco de Occidente',
  'Scotiabank Colpatria',
  'Banco Popular',
  'Banco AV Villas',
  'Banco Caja Social',
  'Itaú',
  'Otro',
] as const;

export const configuracionSchema = z.object({
  nombre: z.string().trim().min(1, { error: 'El nombre del negocio es obligatorio' }).max(120),
  telefono: z.string().trim().max(30).optional().or(z.literal('')),
  direccion: z.string().trim().max(200).optional().or(z.literal('')),
  nit: z.string().trim().max(40).optional().or(z.literal('')),
  // Tipo de negocio: decide el menu del celular y los ejemplos del arranque.
  categoria: z.string().trim().max(40).optional().or(z.literal('')),
  // El numero del bot. Antes solo se preguntaba al registrarse y no habia
  // forma de cambiarlo despues: quedaba inalcanzable para siempre.
  whatsapp_numero: z.string().trim().max(30).optional().or(z.literal('')),
  breb_llave: z.string().trim().max(99).optional().or(z.literal('')),
  breb_banco: z.string().trim().max(60).optional().or(z.literal('')),
  breb_merchant_id: z.string().trim().max(99).optional().or(z.literal('')),
  // Payload EMVCo del QR oficial que el negocio subió desde la app de su banco.
  breb_qr_payload: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type ConfiguracionInput = z.infer<typeof configuracionSchema>;
