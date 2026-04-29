# Admin Manual

## Access Model

Admin API access is granted when either condition is true:

- The authenticated user exists in `public.admin_users` with `active = true`.
- The authenticated email is listed in `ADMIN_EMAILS`.

Evidence:

- `app/api/admin/metrics/route.ts`
- `app/api/admin/settings/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/users/[userId]/route.ts`
- `app/api/admin/email-automations/route.ts`

The `/admin` UI is visible under the private app shell, but data/API actions return `403` for non-admin users.

## Admin Areas

- Overview metrics: users, subscriptions, activity, signups, conversion.
- Growth/usage dashboards.
- Email automation previews and test sends.
- User management: create/update users, manual grants, ban/reset/delete controls.
- Operations: platform controls and scheduled motivation settings.

Evidence:

- `app/(private)/admin/page.tsx`
- `app/(private)/admin/AccessGrantManager.tsx`
- `app/(private)/admin/AdminEmailAutomations.tsx`
- `app/(private)/admin/AdminUsersManager.tsx`

## Operational Checks Before Public Launch

- Confirm at least two staff accounts have admin access.
- Confirm non-admin users receive `403` from `/api/admin/*`.
- Confirm manual access grants create/update `user_entitlements`.
- Confirm destructive user actions cannot target the active admin's own account.
- Confirm Resend is configured before using test email sends.
- Confirm scheduled motivation settings exist in `admin_settings`.

## Support Data

Support tickets and messages use owner/admin RLS policies. Attachments use the `support_attachments` bucket.

Evidence:

- `supabase/migrations/20260305_support_tickets.sql`
- `lib/supportTicketsSupabase.ts`
