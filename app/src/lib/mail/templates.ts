/**
 * Transactional mail templates (P1-11, ADR-0009). Pure functions: (locale, params) → { subject, text, html }.
 * Kept out of next-intl on purpose — mail is rendered inside jobs (no request scope) and must be vitest-loadable.
 * Every param is HTML-escaped; links are absolute (built by the caller from the tenant origin).
 */
export const MAIL_TEMPLATES = ["auth.reset", "auth.activate"] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export type MailLocale = "ar" | "en";
export type RenderedMail = { subject: string; text: string; html: string };

export type TemplateParams = {
  "auth.reset": { name: string; tenantName: string; link: string; minutes: number };
  "auth.activate": { name: string; tenantName: string; link: string; hours: number };
};

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function layout(
  locale: MailLocale,
  title: string,
  body: string,
  cta: { href: string; label: string },
): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:Tahoma,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
<p style="line-height:1.7">${body}</p>
<p style="margin:24px 0"><a href="${escapeHtml(cta.href)}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(cta.label)}</a></p>
<p style="font-size:12px;color:#475569;word-break:break-all">${escapeHtml(cta.href)}</p>
</div></body></html>`;
}

const T: {
  [K in MailTemplate]: Record<MailLocale, (p: TemplateParams[K]) => RenderedMail>;
} = {
  "auth.reset": {
    ar: (p) => ({
      subject: `إعادة تعيين كلمة المرور — ${p.tenantName}`,
      text: `مرحبًا ${p.name}،\n\nطُلبت إعادة تعيين كلمة المرور لحسابك في ${p.tenantName}. افتح الرابط التالي خلال ${p.minutes} دقائق:\n${p.link}\n\nإن لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة المرور الحالية لا تتغيّر.`,
      html: layout(
        "ar",
        "إعادة تعيين كلمة المرور",
        `مرحبًا ${escapeHtml(p.name)}،<br>طُلبت إعادة تعيين كلمة المرور لحسابك في <strong>${escapeHtml(p.tenantName)}</strong>. الرابط صالح لمدة <strong>${p.minutes} دقائق</strong> ولاستخدام واحد.<br>إن لم تطلب ذلك فتجاهل هذه الرسالة.`,
        { href: p.link, label: "تعيين كلمة مرور جديدة" },
      ),
    }),
    en: (p) => ({
      subject: `Reset your password — ${p.tenantName}`,
      text: `Hello ${p.name},\n\nA password reset was requested for your ${p.tenantName} account. Open this link within ${p.minutes} minutes:\n${p.link}\n\nIf you did not request this, ignore this message; your current password stays unchanged.`,
      html: layout(
        "en",
        "Reset your password",
        `Hello ${escapeHtml(p.name)},<br>A password reset was requested for your <strong>${escapeHtml(p.tenantName)}</strong> account. The link is valid for <strong>${p.minutes} minutes</strong> and can be used once.<br>If you did not request this, ignore this message.`,
        { href: p.link, label: "Set a new password" },
      ),
    }),
  },
  "auth.activate": {
    ar: (p) => ({
      subject: `تفعيل حسابك — ${p.tenantName}`,
      text: `مرحبًا ${p.name}،\n\nأُنشئ حساب لك في ${p.tenantName}. لتفعيله وتعيين كلمة المرور افتح الرابط التالي خلال ${p.hours} ساعة:\n${p.link}`,
      html: layout(
        "ar",
        "تفعيل حسابك",
        `مرحبًا ${escapeHtml(p.name)}،<br>أُنشئ حساب لك في <strong>${escapeHtml(p.tenantName)}</strong>. لتفعيله وتعيين كلمة المرور استخدم الرابط خلال <strong>${p.hours} ساعة</strong>.`,
        { href: p.link, label: "تفعيل الحساب" },
      ),
    }),
    en: (p) => ({
      subject: `Activate your account — ${p.tenantName}`,
      text: `Hello ${p.name},\n\nAn account was created for you at ${p.tenantName}. Open this link within ${p.hours} hours to activate it and set your password:\n${p.link}`,
      html: layout(
        "en",
        "Activate your account",
        `Hello ${escapeHtml(p.name)},<br>An account was created for you at <strong>${escapeHtml(p.tenantName)}</strong>. Use the link within <strong>${p.hours} hours</strong> to activate it and set your password.`,
        { href: p.link, label: "Activate account" },
      ),
    }),
  },
};

export function renderMail<K extends MailTemplate>(
  template: K,
  locale: string,
  params: TemplateParams[K],
): RenderedMail {
  const l: MailLocale = locale === "en" ? "en" : "ar";
  return T[template][l](params);
}
