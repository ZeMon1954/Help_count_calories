import 'dotenv/config';
import { z } from 'zod';

const optionalUrl = z
  .union([z.literal(''), z.url()])
  .transform((value) => value || undefined);
const optionalSecret = z
  .union([z.literal(''), z.string().min(1)])
  .transform((value) => value || undefined);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  SUPABASE_URL: optionalUrl.optional(),
  SUPABASE_ANON_KEY: optionalSecret.optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret.optional(),
  DATABASE_URL: optionalUrl.optional(),
  GEMINI_API_KEY: optionalSecret.optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  AI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(30000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success)
    throw new Error(
      `Invalid environment variables: ${z.prettifyError(result.error)}`,
    );
  return result.data;
}
