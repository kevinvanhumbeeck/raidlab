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

## Workflow

- `main` = production (www.raidlab.net). `development` = integration branch with its own Vercel preview.
- Work on `feat/<issue>-<slug>` or `fix/<issue>-<slug>` branches off `development`, open a PR into
  `development`, and release with a PR from `development` into `main`.
- Commit messages: `feat(scope): ...`, `fix(scope): ...`, `chore: ...`.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck and build on pushes and PRs to both branches.
- Preview deployments use the **production** Supabase database, so test data created there is real data.
- When a PR includes a migration, run it in Supabase before merging to `main`.

## Infrastructure

- **Code**: https://github.com/kevinvanhumbeeck/raidlab (private). Pushes to `main` deploy to production;
  other branches (including `development`) get Vercel preview URLs.
- **Hosting**: Vercel project `raidlab`, env vars `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (sensitive), `DISCORD_GUILD_ID` and the role IDs
  `DISCORD_RAIDER_ROLE_ID` (comma-separated: @raider and @pug), `DISCORD_OFFICER_ROLE_ID`.
  Don't add Vercel's Supabase/Postgres integration.
- **Access**: only members of Discord server `1230423637182382132` with the @raider, @pug or @officer role
  get in; @officer also makes them an officer in the app. Checked at every login (OAuth scope
  `guilds.members.read`, no bot needed), so role changes apply at the next login. Officers can revoke access
  at `/manage` until that player's next login.
- **Discord bot** (optional, #49): announces new raids in `DISCORD_RAID_CHANNEL_ID` with In / Out /
  Character-spec buttons and keeps the post up to date. Needs `DISCORD_PUBLIC_KEY` and `DISCORD_BOT_TOKEN`
  from the same Discord app as the login, and its **Interactions Endpoint URL** set to
  `https://www.raidlab.net/api/discord/interactions`. Invite it with the `bot` and `applications.commands`
  scopes and the View Channel, Send Messages, Embed Links and Read Message History permissions. Officers
  can post or refresh a raid by hand from the raid page, and ping the members who haven't responded (#58).
- **Sign-up reminders** (optional, #59): once a day the bot DMs every member who hasn't responded to a raid
  starting in the next few hours. A Vercel cron job (`vercel.json`, 16:00 UTC, so 17:00–18:00 realm time in
  winter) calls `/api/discord/reminders`; set `CRON_SECRET` in Vercel, which Vercel sends with the call. In
  summer time, move it to 15:00 UTC so it still lands before the 19:00 lock. Players turn the DMs off on
  `/characters`.
- **Domain**: `www.raidlab.net` is primary; `raidlab.net` redirects to it. DNS at Cloudflare,
  records DNS-only (grey cloud) pointing to Vercel.
- **Supabase auth URLs**: Site URL `https://www.raidlab.net`; redirect URLs
  `https://www.raidlab.net/**`, `http://localhost:3000/**`, `https://*-kevinvanhumbeeck.vercel.app/**`.
- **Database changes are not deployed automatically**: run new files in `supabase/migrations/`
  in the Supabase SQL editor before pushing code that depends on them.

## Backups

The free Supabase tier has no downloadable backups, so `scripts/backup.sh` makes its own: a `pg_dump` of the
data (the `public` schema plus `auth.users` and `auth.identities`, so profiles keep their Discord logins),
gzipped and encrypted with a passphrase. The schema itself comes from `supabase/migrations`.

- **Nightly**: `.github/workflows/backup.yml` runs it at 03:17 UTC and keeps each dump as a workflow artifact
  for 90 days. Run it by hand from the Actions tab. The repo is public and anyone logged in to GitHub can
  download artifacts, which is why the dumps are encrypted.
- **On demand**, e.g. before a risky migration (needs `pg_dump` 17 or newer):
  `SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh` writes to `backups/` (git-ignored).
- **Secrets** (repo → Settings → Secrets and variables → Actions):
  - `SUPABASE_DB_URL`: the **Session pooler** connection string from the dashboard's Connect panel, with the
    database password filled in. GitHub runners only have IPv4; the direct connection is IPv6-only.
  - `BACKUP_PASSPHRASE`: keep a copy in a password manager. Without it the backups can't be decrypted.
- GitHub pauses scheduled workflows in public repos after 60 days without commits, and emails when a run fails.

**Restoring** into a fresh Supabase project:

1. Apply `supabase/migrations` (not `seed.sql`; the dump has that data).
2. Decrypt the dump and load it with `psql` 17.6 or newer (older versions don't know the dump's `\restrict` line),
   emptying the tables the migrations filled first. Triggers are off while loading, so new profiles and slugs
   aren't generated over the restored ones:

   ```sh
   gpg --decrypt raidlab-<date>.sql.gz.gpg | gunzip > restore.sql
   psql "$SUPABASE_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
     -c "set session_replication_role = replica" \
     -c "do \$\$ declare t text; begin for t in select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public' loop execute 'truncate ' || t || ' cascade'; end loop; end \$\$" \
     -f restore.sql
   ```

3. Redo the Discord provider and auth URL settings from Setup.

## Test data

`supabase/dev/sample_data.sql` adds the roster from the spreadsheet as fake players with a sample raid;
`supabase/dev/sample_attendance.sql` (run after it) adds 10 past raids with comps and attendance;
`supabase/dev/remove_sample_data.sql` removes all of it. Remove it before players register, since character
names must be unique.
