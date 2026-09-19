# AI Fitness & Calorie Tracker

Production-oriented monorepo foundation for an Expo mobile app and Fastify API. This setup intentionally contains no food scanning, workout, recommendation, reminder, AI, or database-table implementation.

## Requirements

- Node.js 22 or 24
- npm 10+
- Android Studio/Android Emulator, Xcode/iOS Simulator (macOS), or a physical device

## Install

```bash
cd ai-fitness-tracker
npm install
```

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and `apps/api/.env.example` to `apps/api/.env`, then fill in your environment-specific values. Never commit these files.

## Run

```bash
npm run dev:api
npm run dev:mobile
```

The API listens on `http://0.0.0.0:3000`; its health endpoint is `GET /api/health`.

For the Android Emulator, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api`. A physical device must use the development computer's reachable LAN IP (for example `http://192.168.1.20:3000/api`) or a secure tunnel. `localhost` on a device points to the device itself.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

## Security notes

- Only the Supabase URL and publishable/legacy anon key belong in the mobile app. Any `EXPO_PUBLIC_` value is visible to users.
- Mobile auth sessions use Expo SecureStore on native platforms. Web session persistence is intentionally disabled in this setup.
- The API auth plugin verifies bearer tokens with Supabase and derives the user ID from the verified token, never from client-submitted IDs.
- Keep service-role, database, and AI keys server-only. Service-role access must be limited to operations with explicit authorization.
- Enable Row Level Security and user ownership policies before adding user-owned tables. No database schema or migration is created in this phase.
- Remote Android push notifications require a development build; Expo Go only supports local notifications.

## Supabase

Create a Supabase project manually, then configure its URL and current publishable key. The legacy anon key remains supported when necessary. No credentials, database tables, storage buckets, or migrations are provisioned by this repository.

### Authentication redirects

The mobile app uses the `aifitness` scheme and requests password recovery with a redirect to the `reset-password` route. Add the applicable URL to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

- Development/production build: `aifitness://reset-password`
- Expo Go on the current LAN: the exact `exp://.../--/reset-password` URL generated for the running Metro session

Expo Go URLs can change with the host or Metro port. Use a development build with the custom scheme for a stable end-to-end recovery test. Password recovery must be manually verified on a device before release.

The API exposes `GET /api/me` for authenticated clients. It validates the bearer token with Supabase Auth and returns only the verified user ID and email.

### Existing profiles schema

This repository does not contain the remote `public.profiles` definition, trigger, or RLS migrations. Inspect those objects in the Supabase SQL Editor before adding any profile creation code. The application intentionally does not insert profiles or use a service-role key during registration.
