/**
 * Mail transport (P1-11, ADR-0009 §4). One interface, two drivers:
 *  - `log`  (default): renders and writes the message to the logger; returns the rendered body so the Job stores a
 *            preview (`Job.result`). No network — what dev/test/e2e run.
 *  - `smtp` : nodemailer over SMTP_HOST:SMTP_PORT (Mailpit locally: 1025, no auth). Missing SMTP_HOST fails at first
 *            use with a clear message, never silently.
 * The transport is a globalThis singleton (P1-12) — see mailTransport().
 * Never import from client components. Never call from a request handler directly — enqueue `Job mail.send`
 * (features/auth/core.enqueueMail) so delivery is retried by the worker (P1-12) and recorded in Job.result.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { renderMail, type MailTemplate, type TemplateParams } from "./templates";

export type MailMessage = { to: string; subject: string; text: string; html: string };
export type MailResult = { transport: "log" | "smtp"; messageId: string; preview?: MailMessage };

export interface MailTransport {
  readonly name: "log" | "smtp";
  send(message: MailMessage): Promise<MailResult>;
}

class LogTransport implements MailTransport {
  readonly name = "log" as const;
  async send(message: MailMessage): Promise<MailResult> {
    const messageId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info(
      { to: message.to, subject: message.subject, messageId, text: message.text },
      "mail.log_transport",
    );
    return { transport: "log", messageId, preview: message };
  }
}

class SmtpTransport implements MailTransport {
  readonly name = "smtp" as const;
  private readonly transporter: Transporter;
  constructor() {
    if (!env.SMTP_HOST) {
      throw new Error("MAIL_TRANSPORT=smtp requires SMTP_HOST (Mailpit locally: 127.0.0.1:1025).");
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  async send(message: MailMessage): Promise<MailResult> {
    const info = await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    logger.info({ to: message.to, subject: message.subject, messageId: info.messageId }, "mail.smtp_sent");
    return { transport: "smtp", messageId: String(info.messageId) };
  }
}

/**
 * Singleton on globalThis (not module scope): Turbopack duplicates modules per entry kind (route handler / RSC /
 * proxy), so a module-level cache would create one SMTP pool per copy. Same pattern as prisma.ts / tenant-resolver.ts.
 */
const TRANSPORT_KEY = Symbol.for("scam2027.mailTransport");
const store = globalThis as unknown as Record<symbol, MailTransport | undefined>;

export function mailTransport(): MailTransport {
  return (store[TRANSPORT_KEY] ??= env.MAIL_TRANSPORT === "smtp" ? new SmtpTransport() : new LogTransport());
}

/** Test-only: drop the cached transport so a changed env takes effect. */
export function resetMailTransportForTests(): void {
  store[TRANSPORT_KEY] = undefined;
}

/** Render + send in one step (used by the mail.send job processor). */
export async function sendTemplate<K extends MailTemplate>(
  to: string,
  template: K,
  locale: string,
  params: TemplateParams[K],
): Promise<MailResult> {
  const rendered = renderMail(template, locale, params);
  return mailTransport().send({ to, ...rendered });
}

export { renderMail, MAIL_TEMPLATES } from "./templates";
export type { MailTemplate, TemplateParams } from "./templates";
