import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email({ error: 'Email no válido' }).trim(),
  password: z.string().min(1, { error: 'Escribe tu contraseña' }),
});

export const registerSchema = z.object({
  nombre: z
    .string()
    .min(2, { error: 'Tu nombre debe tener al menos 2 letras' })
    .max(80)
    .trim(),
  email: z.email({ error: 'Email no válido' }).trim(),
  password: z
    .string()
    .min(8, { error: 'Mínimo 8 caracteres' })
    .max(72, { error: 'Máximo 72 caracteres' }),
});

export const empresaSchema = z.object({
  nombre_negocio: z
    .string()
    .min(2, { error: 'El nombre del negocio es muy corto' })
    .max(120)
    .trim(),
  email: z.email({ error: 'Email no válido' }).trim(),
  nit: z.string().trim().optional().or(z.literal('')),
  direccion: z.string().trim().optional().or(z.literal('')),
  telefono: z.string().trim().optional().or(z.literal('')),
  categoria: z.string().trim().optional().or(z.literal('')),
  whatsapp_numero: z.string().trim().optional().or(z.literal('')),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type EmpresaInput = z.infer<typeof empresaSchema>;
