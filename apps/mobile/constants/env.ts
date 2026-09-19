function optionalUrl(
  name: string,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

const apiUrl = optionalUrl(
  'EXPO_PUBLIC_API_URL',
  process.env.EXPO_PUBLIC_API_URL,
);
const supabaseUrl = optionalUrl(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined;

if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set together',
  );
}

export const mobileEnv = {
  apiUrl,
  supabaseUrl,
  supabaseKey,
} as const;
