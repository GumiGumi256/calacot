export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export type NotificationTemplateProps = {
  heading: string;
  reference: string;
  message: string;
  audience: "customer" | "team";
  details?: Array<[string, string]>;
  action?: { label: string; url: string };
};

function safeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Email links must use HTTPS");
  return escapeHtml(url.toString());
}

/** Shared escaped, responsive layout with light/dark mode support. Live text branding works with images disabled. */
export function renderNotificationTemplate({
  heading,
  reference,
  message,
  audience,
  details = [],
  action,
}: NotificationTemplateProps) {
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:14px 0;border-bottom:1px solid #e8e7e3" class="row-border"><p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#77777f" class="muted">${escapeHtml(label)}</p><p style="margin:0;font-size:15px;line-height:24px;overflow-wrap:anywhere" class="text">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p></td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(heading)} | Calacot</title>
<style>
body{margin:0!important}
table{border-collapse:collapse}
.logo-dark{display:none}
@media only screen and (max-width:620px){.outer{padding:16px 8px!important}.pad{padding-left:24px!important;padding-right:24px!important}.headline{font-size:32px!important;line-height:39px!important}}
@media (prefers-color-scheme:dark){
  .bg{background:#0f0f13!important}
  .card{background:#1a1a20!important}
  .footer-card{background:#111015!important}
  .text{color:#f5f6fc!important}
  .headline{color:#f5f6fc!important}
  .muted{color:#a6a6ad!important}
  .row-border{border-bottom-color:#2c2c33!important}
  .ref-box{background:#232329!important}
  .footer-note{color:#8a8a91!important}
  .logo-light{display:none!important}
  .logo-dark{display:block!important}
}
</style></head>
<body style="margin:0;background:#e9e9eb;font-family:Arial,Helvetica,sans-serif;color:#14141a" class="bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(heading)}</div>
<table role="presentation" width="100%"><tr><td class="outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:600px;background:#fff" class="card">
<tr><td class="pad" style="padding:32px 40px 12px"><a href="https://calacot.com" style="display:inline-block">
<img src="https://calacot.com/calacot-logo.png" width="150" alt="Calacot" class="logo-light" style="display:block;width:150px;height:auto;border:0">
<img src="https://calacot.com/calacot-logo-vertical-white.svg" width="150" alt="Calacot" class="logo-dark" style="display:none;width:150px;height:auto;border:0">
</a></td></tr>
<tr><td style="padding:0 40px"><div style="height:3px;background:#ffc919;width:100%"></div></td></tr>
<tr><td class="pad" style="padding:26px 40px 38px">
<p style="margin:0 0 14px;color:#77777f;font-size:11px;letter-spacing:1.5px;text-transform:uppercase" class="muted">${audience === "team" ? "Team notification" : "Purchase update"}</p>
<h1 class="headline" style="margin:0 0 34px;font-size:38px;line-height:46px;font-weight:400;color:#14141a">${escapeHtml(heading)}</h1>
<p style="margin:0;font-size:19px;line-height:28px" class="text">${escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>
<p style="margin:28px 0;padding:18px 20px;background:#f3f2ed;border-left:3px solid #ffc919;font-size:13px;line-height:21px;overflow-wrap:anywhere" class="ref-box text"><strong>Reference</strong><br>${escapeHtml(reference)}</p>
${rows ? `<table role="presentation" width="100%" style="table-layout:fixed">${rows}</table>` : ""}
${action ? `<table role="presentation" style="margin-top:30px"><tr><td bgcolor="#ffc919" style="padding:17px 28px;border-radius:999px"><a href="${safeUrl(action.url)}" style="color:#14141a;text-decoration:none;font-size:15px;font-weight:bold">${escapeHtml(action.label)}</a></td></tr></table>` : ""}
<p style="margin:30px 0 0;font-size:14px;line-height:23px" class="text">${audience === "team" ? "Use the contact details above to follow up." : "Have something to add? Reply to this email and include your reference."}</p></td></tr>
<tr><td class="pad footer-card" style="padding:28px 40px;background:#f7f7f7"><p style="margin:0;font-size:20px;font-weight:bold;color:#ffc919">CALACOT</p><p style="margin:14px 0 0;font-size:12px;line-height:20px;color:#77777f" class="muted"><strong>Calacot Uganda Limited</strong><br><a href="https://calacot.com" style="color:#77777f">calacot.com</a></p><p style="font-size:11px;line-height:18px;color:#8a8a91" class="footer-note">${audience === "team" ? "Internal notification. Handle customer details with care." : "This email follows a request on our website. If you did not submit it, you can ignore it."}</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

export function renderEnquiryTemplate({
  audience,
  heading,
  reference,
  next,
  details,
}: {
  audience: "customer" | "team";
  heading: string;
  reference: string;
  next?: string;
  details?: Array<[string, string]>;
}) {
  return renderNotificationTemplate({
    audience,
    heading,
    reference,
    details,
    message:
      audience === "team"
        ? "A new enquiry has been saved. Review the details below and follow up using the customer's preferred contact method."
        : `Thank you for contacting Calacot. ${next || ""}`,
    action:
      audience === "customer"
        ? { label: "Explore Calacot", url: "https://calacot.com" }
        : undefined,
  });
}
