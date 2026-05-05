# Admin Setup for Dev and Production

Recommended setup:

- Keep `dev/local` and `production` on separate Supabase projects.
- Use the same email and password in both projects.
- Give that same user admin access in both projects.

This gives you one identity without risking production data while you build locally.

## 1. Point local web to the dev Supabase project

Update `/Users/SGPAX/Dev/trading-journal-pro/.env.local` so these values point to your dev project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep production credentials only in production envs (for example Vercel), not in local dev.

## 2. Point local mobile to the same dev project

Update both of these to the same dev project:

- `/Users/SGPAX/Dev/trading-journal-pro/mobile/.env`
- `/Users/SGPAX/Dev/trading-journal-pro/mobile/.xcode.env.local`

Use:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

That way web local and mobile local both talk to the same dev data.

## 3. Bootstrap the same user in dev

Run this from the repo root:

```bash
TARGET_EMAIL="you@example.com" \
TARGET_PASSWORD="your-shared-password" \
TARGET_FIRST_NAME="YourFirstName" \
TARGET_LAST_NAME="YourLastName" \
ENV_FILE=".env.local" \
npm run admin:bootstrap
```

What it does:

- creates the auth user if it does not exist
- updates it if it already exists
- upserts the `profiles` row
- grants active entitlements
- marks the user as admin in `admin_users`

By default it grants all current access keys and sets the user to `advanced`.

## 4. Bootstrap the same user in production

Run the same script against a production env file or production shell envs:

```bash
TARGET_EMAIL="you@example.com" \
TARGET_PASSWORD="your-shared-password" \
TARGET_FIRST_NAME="YourFirstName" \
TARGET_LAST_NAME="YourLastName" \
ENV_FILE=".env.production.local" \
npm run admin:bootstrap
```

If you do not keep a production env file locally, export the production values in your shell first and omit `ENV_FILE`.

## 5. Optional admin allow-list

`ADMIN_EMAILS` can be used as a server-side fallback allow-list for admin APIs.

That is useful as an emergency path, but the main admin source should still be the `admin_users` table.

## 6. What stays shared vs separate

With this setup:

- identity can be the same
- password can be the same
- admin role can be the same
- local/dev data stays separate from production data

What does **not** sync automatically:

- journal entries
- growth plans
- AI coach threads
- settings
- any other user data

If local and production point to different Supabase projects, the data is separate by design.
