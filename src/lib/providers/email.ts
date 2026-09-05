import { Resend } from "resend";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<ProviderResult<{ id: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return notConfigured("RESEND_API_KEY / RESEND_FROM_EMAIL is not set.");
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if (error || !data) {
      return requestFailed(error?.message ?? "Resend returned no data.");
    }

    return ok({ id: data.id });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Resend request failed.");
  }
}
