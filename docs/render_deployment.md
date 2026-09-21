# Deploy API to Render

The root `render.yaml` creates one Node web service in Singapore. It builds only
the Fastify API and checks `GET /api/health`. It does not run database
migrations or request a Supabase service-role key.

## Render setup

1. Push `render.yaml` and the application changes to the GitHub repository.
2. In Render, choose **New > Blueprint** and connect the repository.
3. Review the `nub-cal-api` service and provide these secret values when asked:
   - `SUPABASE_URL`: the project's Supabase URL.
   - `SUPABASE_ANON_KEY`: the project's publishable/anon key, never the service-role key.
   - `GEMINI_API_KEY`: the Google AI Studio API key.
4. Deploy and wait for `/api/health` to become healthy.

Do not add `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`; the API uses the
caller's verified JWT and RLS-backed Supabase REST/RPC calls.

## Point Expo at Render

After Render provides the public hostname, set this locally in
`apps/mobile/.env` (do not commit the file):

```env
EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com/api
```

Restart Metro so Expo embeds the new public value:

```powershell
npm run dev:mobile -- --clear
```

Verify these URLs before testing login and AI scanning:

```text
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/profile
```

The health route should return HTTP 200. The profile route without a bearer
token should return HTTP 401, which confirms authentication remains protected.
