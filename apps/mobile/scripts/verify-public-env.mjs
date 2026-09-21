import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicVariables = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const name = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [name, value];
      }),
  );
}

// Vercel injects process.env. These files only support the equivalent local Expo build.
const fileEnvironment = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
].reduce(
  (combined, file) => ({ ...combined, ...parseEnvFile(resolve(file)) }),
  {},
);

const environment = Object.fromEntries(
  publicVariables.map((name) => [
    name,
    process.env[name]?.trim() || fileEnvironment[name]?.trim() || '',
  ]),
);

const missing = publicVariables.filter((name) => !environment[name]);
if (missing.length) {
  console.error(
    `[build-env] FAILED (${process.env.VERCEL_ENV || 'local'}): missing ${missing.join(', ')}`,
  );
  process.exit(1);
}

for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL']) {
  try {
    const url = new URL(environment[name]);
    if (url.protocol !== 'https:' && process.env.VERCEL) {
      throw new Error('Vercel URLs must use HTTPS');
    }
  } catch {
    console.error(
      `[build-env] FAILED (${process.env.VERCEL_ENV || 'local'}): ${name} is not a valid allowed URL`,
    );
    process.exit(1);
  }
}

const supabaseUrl = new URL(environment.EXPO_PUBLIC_SUPABASE_URL);
if (supabaseUrl.pathname !== '/') {
  console.error(
    `[build-env] FAILED (${process.env.VERCEL_ENV || 'local'}): EXPO_PUBLIC_SUPABASE_URL must be the project base URL`,
  );
  process.exit(1);
}

console.log(
  `[build-env] OK (${process.env.VERCEL_ENV || 'local'}): all required public variables are present`,
);
