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
  breb_llave: z.string().trim().max(99).optional().or(z.literal('')),
  breb_banco: z.string().trim().max(60).optional().or(z.literal('')),
  breb_merchant_id: z.string().trim().max(99).optional().or(z.literal('')),
  // Payload EMVCo del QR oficial que el negocio subió desde la app de su banco.
  breb_qr_payload: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type ConfiguracionInput = z.infer<typeof configuracionSchema>;
