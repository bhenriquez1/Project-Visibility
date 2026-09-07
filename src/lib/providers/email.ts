import { Resend } from "resend";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
  unsubscribeUrl?: string;
  /** Embedded into a real Message-ID header — a stable identifier a reply's In-Reply-To/
   * References can point back to, so an inbound webhook can thread it to this exact message
   * rather than only guessing from the sender's address. */
  messageId?: string;
}): Promise<ProviderResult<{ id: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.RESEND_INBOUND_REPLY_TO;

  if (!apiKey || !from) {
    return notConfigured("RESEND_API_KEY / RESEND_FROM_EMAIL is not set.");
  }

  try {
    const resend = new Resend(apiKey);
    const html = input.unsubscribeUrl
      ? `${input.html}<p style="margin-top:24px;font-size:12px;color:#888;">Don't want these emails? <a href="${input.unsubscribeUrl}">Unsubscribe</a>.</p>`
      : input.html;

    const fromDomain = from.split("@")[1] ?? "localvisibilityai.invalid";
    const headers: Record<string, string> = {};
    if (input.messageId) headers["Message-ID"] = `<${input.messageId}@${fromDomain}>`;
    if (input.unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html,
        ...(replyTo ? { replyTo } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );

    if (error || !data) {
      return requestFailed(error?.message ?? "Resend returned no data.");
    }

    return ok({ id: data.id });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Resend request failed.");
  }
}

/**
 * Live check, not a manual flag — supersedes the old, unread `outbound_infrastructure_verified`
 * Setting. Sending should be blocked on the sending domain's REAL current Resend status, not on
 * whether an owner remembered to flip a toggle.
 */
export async function verifySendingDomainReady(): Promise<ProviderResult<{ status: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return notConfigured("RESEND_API_KEY / RESEND_FROM_EMAIL is not set.");
  }

  const domainName = from.split("@")[1];
  if (!domainName) {
    return requestFailed(`RESEND_FROM_EMAIL "${from}" has no domain part.`);
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.domains.list();
    if (error || !data) {
      return requestFailed(error?.message ?? "Resend returned no domains.");
    }

    const domain = data.data.find((d) => d.name === domainName);
    if (!domain) {
      return requestFailed(`No Resend domain matching "${domainName}" is configured on this account.`);
    }
    if (domain.status !== "verified") {
      return requestFailed(`Sending domain "${domainName}" is "${domain.status}", not verified.`);
    }

    return ok({ status: domain.status });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Resend request failed.");
  }
}
