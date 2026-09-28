export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export type NotificationTemplateProps = {
  heading: string; reference: string; message: string; audience: "customer" | "team";
  details?: Array<[string, string]>;
  action?: { label: string; url: string };
};

function safeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Email links must use HTTPS");
  return escapeHtml(url.toString());
}

/** Shared escaped, responsive layout. Live text branding works with images disabled. */
export function renderNotificationTemplate({ heading, reference, message, audience, details = [], action }: NotificationTemplateProps) {
  const rows = details.map(([label, value]) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e8e7e3"><p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#6b6b73">${escapeHtml(label)}</p><p style="margin:0;font-size:15px;line-height:24px;overflow-wrap:anywhere">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)} | Calacot</title>
<style>body{margin:0!important}table{border-collapse:collapse}@media only screen and (max-width:620px){.outer{padding:16px 8px!important}.pad{padding-left:24px!important;padding-right:24px!important}.headline{font-size:30px!important;line-height:38px!important}}</style></head>
<body style="margin:0;background:#efefed;font-family:Arial,Helvetica,sans-serif;color:#202026">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(heading)}</div>
<table role="presentation" width="100%"><tr><td class="outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:600px;background:#fff">
<tr><td height="6" bgcolor="#ffc919" style="font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pad" bgcolor="#1b1b21" style="padding:32px 40px;color:#fff">
<a href="https://calacot.com" style="color:#ffc919;text-decoration:none;font-size:26px;font-weight:bold;letter-spacing:5px">CALACOT</a>
<p style="margin:28px 0 12px;color:#ffc919;font-size:11px;letter-spacing:2px;text-transform:uppercase">${audience === "team" ? "Team notification" : "Calacot / Confirmation"}</p>
<h1 class="headline" style="margin:0;font-size:36px;line-height:44px;font-weight:400">${escapeHtml(heading)}</h1></td></tr>
<tr><td class="pad" style="padding:32px 40px"><p style="margin:0;font-size:16px;line-height:27px">${escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>
<p style="padding:18px 20px;background:#f5f5f2;border-left:3px solid #ffc919;font-size:12px;line-height:20px;overflow-wrap:anywhere"><strong>Reference</strong><br>${escapeHtml(reference)}</p>
${rows ? `<table role="presentation" width="100%" style="table-layout:fixed">${rows}</table>` : ""}
${action ? `<table role="presentation" style="margin-top:28px"><tr><td bgcolor="#ffc919" style="padding:15px 24px"><a href="${safeUrl(action.url)}" style="color:#202026;text-decoration:none;font-size:14px;font-weight:bold">${escapeHtml(action.label)}</a></td></tr></table>` : ""}
<p style="margin:28px 0 0;font-size:14px;line-height:24px">${audience === "team" ? "Use the contact details above to follow up." : "Have something to add? Reply to this email and include your reference."}</p></td></tr>
<tr><td class="pad" style="padding:24px 40px;border-top:1px solid #e8e7e3;background:#fafaf8"><p style="margin:0;font-size:12px;line-height:20px;color:#6b6b73"><strong>Calacot Uganda Limited</strong><br><a href="https://calacot.com" style="color:#4f4f58">calacot.com</a></p><p style="font-size:11px;line-height:18px;color:#6b6b73">${audience === "team" ? "Internal notification. Handle customer details with care." : "This email follows a request on our website. If you did not submit it, you can ignore it."}</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

export function renderEnquiryTemplate({ audience, heading, reference, next, details }: {
  audience: "customer" | "team"; heading: string; reference: string;
  next?: string; details?: Array<[string, string]>;
}) {
  return renderNotificationTemplate({
    audience, heading, reference, details,
    message: audience === "team"
      ? "A new enquiry has been saved. Review the details below and follow up using the customer's preferred contact method."
      : `Thank you for contacting Calacot. ${next || ""}`,
    action: audience === "customer" ? { label: "Explore Calacot", url: "https://calacot.com" } : undefined,
  });
}
