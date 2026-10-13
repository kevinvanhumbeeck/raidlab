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
   add the redirect URLs listed under Infrastructure.
5. `cp .env.example .env.local` and fill in values from Supabase → Settings → API.
6. `npm install && npm run dev`

Make yourself an officer after first login (SQL editor):

```sql
update profiles set is_officer = true where display_name = 'YourName';
```

## Infrastructure

- **Code**: https://github.com/kevinvanhumbeeck/raidlab (private). Pushes to `main` deploy to production;
  other branches get Vercel preview URLs.
- **Hosting**: Vercel project `raidlab`, env vars `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Don't add Vercel's Supabase/Postgres integration.
- **Domain**: `www.raidlab.net` is primary; `raidlab.net` redirects to it. DNS at Cloudflare,
  records DNS-only (grey cloud) pointing to Vercel.
- **Supabase auth URLs**: Site URL `https://www.raidlab.net`; redirect URLs
  `https://www.raidlab.net/**`, `http://localhost:3000/**`, `https://*-kevinvanhumbeeck.vercel.app/**`.
- **Database changes are not deployed automatically**: run new files in `supabase/migrations/`
  in the Supabase SQL editor before pushing code that depends on them.

## Test data

`supabase/dev/sample_data.sql` adds the roster from the spreadsheet as fake players with a sample raid;
`supabase/dev/remove_sample_data.sql` removes it. Remove it before players register, since character
names must be unique.
