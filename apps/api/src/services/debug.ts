import { loadEnv } from '../config/env.js';

async function test() {
  const env = loadEnv();
  // We don't have a valid user token to test against Supabase directly via the repository
  // unless we mock it or fetch the API directly.
  console.log("Supabase URL:", env.SUPABASE_URL ? "Exists" : "Missing");
}

test();
