import { Resend } from "resend";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
  unsubscribeUrl?: string;
}): Promise<ProviderResult<{ id: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return notConfigured("RESEND_API_KEY / RESEND_FROM_EMAIL is not set.");
  }

  try {
    const resend = new Resend(apiKey);
    const html = input.unsubscribeUrl
      ? `${input.html}<p style="margin-top:24px;font-size:12px;color:#888;">Don't want these emails? <a href="${input.unsubscribeUrl}">Unsubscribe</a>.</p>`
      : input.html;

    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html,
        // RFC 8058 one-click unsubscribe — real deliverability practice, not just a footer link.
        ...(input.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
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
