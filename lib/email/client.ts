import "server-only";
import { Resend } from "resend";
import { z } from "zod";

let client: Resend | undefined;
export function getEmailClient() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (
    !key ||
    !from ||
    !z.email().safeParse(from).success
  )
    return null;
  client ??= new Resend(key);
  return { client, from: `Calacot <${from}>` };
}

export function getTeamEmail() {
  const address = process.env.ENQUIRY_TEAM_EMAIL?.trim() || "info@calacot.com";
  return z.email().safeParse(address).success ? address! : null;
}
