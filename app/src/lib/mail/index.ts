/**
 * Mail transport (P1-11, ADR-0009 §4). One interface, two drivers:
 *  - `log`  (default): renders and writes the message to the logger; returns the rendered body so the Job stores a
 *            preview (`Job.result`). No network — what dev/test/e2e run.
 *  - `smtp` : P1-12 (nodemailer + Mailpit locally). Selecting it before P1-12 fails loudly at boot, never silently.
 * Never import from client components. Never call from a request handler directly — enqueue `Job mail.send`
 * (features/auth/mail.ts) so delivery is retried and audited by the worker.
 */
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

let cached: MailTransport | null = null;
export function mailTransport(): MailTransport {
  if (cached) return cached;
  if (env.MAIL_TRANSPORT === "smtp") {
    // P1-12 wires nodemailer here. Refusing early is safer than pretending to send.
    throw new Error(
      "MAIL_TRANSPORT=smtp is not available before P1-12 (worker + SMTP). Use MAIL_TRANSPORT=log.",
    );
  }
  cached = new LogTransport();
  return cached;
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
