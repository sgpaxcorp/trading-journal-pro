// lib/email.ts
import { AppUser, PlanId } from "./types";

export async function sendWelcomeEmail(user: AppUser) {
  // FUTURO:
  // conectar con Resend / SendGrid / Mailgun
  // Aquí solo simulamos
  console.log("[EMAIL MOCK] Welcome email sent to:", user.email);
}

export async function sendSubscriptionReceiptEmail(
  user: AppUser,
  plan: PlanId
) {
  // FUTURO:
  // esto saldrá de Stripe webhook + email provider
  console.log(
    "[EMAIL MOCK] Subscription receipt sent to:",
    user.email,
    "for plan:",
    plan
  );
}
