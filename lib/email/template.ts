export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

type TemplateProps = {
  audience: "customer" | "team";
  heading: string;
  reference: string;
  next?: string;
  details?: Array<[string, string]>;
};

// Inline styles and presentation tables keep the layout independent of website CSS.
// A live-text wordmark remains visible when an inbox blocks remote images.
export function renderEnquiryTemplate({ audience, heading, reference, next, details = [] }: TemplateProps) {
  const team = audience === "team";
  const title = team ? "A new conversation<br>starts here." : "Possibilities begin<br>with a conversation.";
  const preheader = team ? `New ${heading.toLowerCase()} saved. Review the enquiry details.` : `Your ${heading.toLowerCase()} is with us. Here is what happens next.`;
  const rows = details.map(([label, value]) => `<tr><td style="padding:16px 0;border-bottom:1px solid #e8e7e3"><p style="margin:0 0 6px;font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:1px;color:#6b6b73">${escapeHtml(label)}</p><p style="margin:0;font-size:15px;line-height:24px;color:#202026;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)} | Calacot</title>
<style>body{margin:0!important;padding:0!important}table{border-collapse:collapse}a{color:inherit}@media only screen and (max-width:620px){.outer{padding:16px 8px!important}.pad{padding-left:24px!important;padding-right:24px!important}.headline{font-size:32px!important;line-height:38px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#efefed;font-family:Arial,Helvetica,sans-serif;color:#202026">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" style="background-color:#efefed"><tr><td class="outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff">
<tr><td height="6" bgcolor="#ffc919" style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pad" bgcolor="#1b1b21" style="padding:32px 40px 36px;color:#ffffff">
<a href="https://calacot.com" style="display:inline-block;color:#ffc919;text-decoration:none;font-size:26px;font-weight:700;letter-spacing:5px;line-height:32px">CALACOT</a>
<p style="margin:32px 0 14px;color:#ffc919;font-size:11px;font-weight:700;line-height:18px;letter-spacing:2px;text-transform:uppercase">${team ? "New enquiry / Team notification" : "Thank you / Enquiry received"}</p>
<h1 class="headline" style="margin:0;font-size:40px;line-height:46px;letter-spacing:-1px;font-weight:400;color:#ffffff">${title}</h1>
</td></tr>
<tr><td class="pad" style="padding:34px 40px 0">
<p style="margin:0 0 12px;font-size:12px;font-weight:700;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:#6b6b73">${escapeHtml(heading)}</p>
<p style="margin:0;font-size:16px;line-height:27px">${team ? "An enquiry has been saved. Review the details below and follow up using the customer’s preferred contact method." : "Thank you for reaching out. Your enquiry is with our team, and we look forward to learning more about what you have in mind."}</p>
</td></tr>
<tr><td class="pad" style="padding:26px 40px">
<table role="presentation" width="100%" bgcolor="#f5f5f2"><tr><td style="padding:18px 20px;border-left:3px solid #ffc919">
<p style="margin:0 0 7px;font-size:10px;font-weight:700;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b73">Your enquiry reference</p>
<p style="margin:0;font-family:Consolas,monospace;font-size:12px;line-height:20px;overflow-wrap:anywhere;word-break:break-all;color:#202026">${escapeHtml(reference)}</p>
</td></tr></table></td></tr>
<tr><td class="pad" style="padding:0 40px 32px">
<h2 style="margin:0 0 12px;font-size:21px;line-height:28px;font-weight:400">${team ? "Enquiry details" : "What happens next"}</h2>
${team ? `<table role="presentation" width="100%" style="table-layout:fixed">${rows}</table><p style="margin:24px 0 0;font-size:14px;line-height:24px;color:#6b6b73">${"Reply to this email if an email address was supplied, or use the contact details above."}</p>` : `<p style="margin:0 0 18px;font-size:15px;line-height:26px;color:#4f4f58">${escapeHtml(next || "")}</p><p style="margin:0;font-size:15px;line-height:26px;color:#4f4f58">Have something to add? Reply to this email and include your reference so we can keep everything together.</p>`}
</td></tr>
${team ? "" : `<tr><td class="pad" style="padding:0 40px 36px"><table role="presentation"><tr><td bgcolor="#ffc919" style="border:1px solid #ffc919;padding:15px 24px;text-align:center"><a href="https://calacot.com" style="font-size:14px;font-weight:700;line-height:20px;color:#1b1b21;text-decoration:none;display:inline-block">Explore Calacot &nbsp; &rarr;</a></td></tr></table><p style="margin:26px 0 0;font-size:15px;line-height:24px">With care,<br><strong>The Calacot team</strong></p></td></tr>`}
<tr><td class="pad" style="padding:24px 40px;border-top:1px solid #e8e7e3;background-color:#fafaf8">
<p style="margin:0 0 8px;font-size:12px;line-height:20px;font-weight:700;color:#4f4f58">Calacot Uganda Limited</p>
<p style="margin:0;font-size:12px;line-height:20px;color:#6b6b73"><a href="https://calacot.com" style="color:#4f4f58;text-decoration:underline">calacot.com</a> &nbsp;&middot;&nbsp; <a href="mailto:info@calacot.com" style="color:#4f4f58;text-decoration:underline">info@calacot.com</a></p>
<p style="margin:14px 0 0;font-size:11px;line-height:18px;color:#6b6b73">${team ? "Internal notification. Handle customer details with care." : "You received this acknowledgement following an enquiry on our website. If you did not submit it, you can ignore this email."}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
