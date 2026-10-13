# Raid Planner

Roster, raid compositions and attendance for our WoW Forever guild.
Next.js (App Router) on Vercel, Supabase for Postgres + Discord login.

## Setup

1. **Supabase**: create a project at https://supabase.com.
   - SQL editor → run `supabase/migrations/20261013000000_init.sql`, then `supabase/seed.sql`.
2. **Discord app**: https://discord.com/developers/applications → New Application → OAuth2.
   - Add redirect: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Copy Client ID + Client Secret.
3. **Supabase → Authentication → Providers → Discord**: enable, paste ID + secret.
4. **Supabase → Authentication → URL Configuration**: Site URL = your Vercel URL;
   add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**` to redirect URLs.
5. `cp .env.example .env.local` and fill in values from Supabase → Settings → API.
6. `npm install && npm run dev`

Make yourself an officer after first login (SQL editor):

```sql
update profiles set is_officer = true where display_name = 'YourName';
```

## Deploy

Import the repo in Vercel and set the same two env vars.
