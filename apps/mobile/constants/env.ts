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

function optionalSupabaseUrl(value: string | undefined): string | undefined {
  const url = optionalUrl('EXPO_PUBLIC_SUPABASE_URL', value);
  if (!url) return undefined;

  const pathname = new URL(url).pathname;
  if (pathname !== '/') {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL must be the project base URL without /rest/v1 or /auth/v1',
    );
  }

  return url;
}

const apiUrl = optionalUrl(
  'EXPO_PUBLIC_API_URL',
  process.env.EXPO_PUBLIC_API_URL,
);
const supabaseUrl = optionalSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
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
