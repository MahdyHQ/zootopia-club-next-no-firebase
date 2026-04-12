# Auth Email Templates

## Zootopia Confirm Email Template

- File: `zootopia-confirm-email-template-supabase.html`
- Purpose: Premium, email-client-safe confirmation template for auth verification emails.
- Brand alignment: Emerald/teal foundation with gold accent, matching the app brand direction.

## Manual Paste Instructions (Supabase Auth + Resend SMTP)

1. Open Supabase Dashboard.
2. Go to Authentication -> Email Templates.
3. Select the `Confirm signup` template.
4. Paste the full contents of `zootopia-confirm-email-template-supabase.html`.
5. Save and send a test email.

## Placeholders Used

This template intentionally uses Supabase Go-template variables:

- `{{ .ConfirmationURL }}`: Main action link.
- `{{ .Token }}`: Optional OTP fallback.
- `{{ .SiteURL }}`: Site URL reference in footer.

## If Pasting Into a Non-Supabase Resend Flow

If you are sending this HTML directly through Resend APIs or a different backend renderer, replace the placeholders with your own variables before send time:

- `{{ .ConfirmationURL }}` -> your confirmation link variable.
- `{{ .Token }}` -> your OTP variable (optional).
- `{{ .SiteURL }}` -> your app/site URL variable.

## Notes

- Keep authentication emails short and task-focused to improve deliverability.
- Avoid adding user-supplied content without sanitization.
- If links are tracked/re-written by an external provider, verify that auth links still function end-to-end.
