/**
 * Calacot Admin Design System V1 verification (Phase 2).
 *   1. Brand tokens and font families are unchanged.
 *   2. Every workflow status has a label and tone in lib/ui/status.ts.
 *   3. Shared formatters produce the documented output.
 *   4. Semantic text tokens meet WCAG AA contrast in light and dark (computed from OKLCH).
 *   5. Admin code does not gain new raw palette colours, arbitrary font sizes or native selects.
 * Run: npm run test:design-system
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { statusRegistry, resolveStatus } from "../lib/ui/status";
import { formatMoney, formatDate, formatDateTime, formatMonth, formatPercent, formatNumber } from "../lib/format";
import { periodChange, tickInterval } from "../lib/charts/config";
import { leadStatuses, paymentStatuses } from "../lib/admin/options";
import { expenseStatuses } from "../lib/finance/options";
import { monthlySeries, monthRange, monthPeriod, type MonthlyActivityRow } from "../lib/charts/series";
import { pageWindow, preferenceKey, resolveHidden } from "../components/data-table/preferences";
import { adminBreadcrumbs, isActivePath } from "../lib/admin/breadcrumbs";
import { effectiveQuotationStatus } from "../lib/sales/quotation-status";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
  }
};

// 1. Brand tokens ---------------------------------------------------------------------------
console.log("Brand tokens");
const css = read("app/globals.css");
const layout = read("app/layout.tsx");
for (const line of [
  "--color-brand-primary: oklch(0.8598 0.1719 88.44);",
  "--color-brand-white: oklch(0.9741 0.008 278.64);",
  "--color-brand-black:oklch(0.1941 0.012 285.23);",
  "--color-brand-green: oklch(0.8803 0.2765 138.82);",
  "--color-brand-accent: oklch(0.4778 0.1433 40.83)",
  "--primary: var(--color-brand-primary);",
  "--radius: 0.625rem;",
]) check(`globals.css keeps ${line.split(":")[0]}`, () => assert.ok(css.includes(line), `missing: ${line}`));
check("brand scales are complete (50-950) for primary, black, white, lavender and grey-olive", () => {
  const steps = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
  const missing = ["primary", "black", "white", "lavender", "grey-olive"].flatMap((name) =>
    steps.filter((step) => !new RegExp(`--color-brand-${name}-${step}:\\s*oklch\\(`).test(css)).map((step) => `${name}-${step}`),
  );
  assert.deepEqual(missing, [], `missing: ${missing.join(", ")}`);
});
check("fonts remain Plus Jakarta Sans (sans) and Outfit (heading)", () => {
  assert.match(layout, /Outfit\(\{[^}]*variable: "--font-heading"/);
  assert.match(layout, /Plus_Jakarta_Sans\(\{[^}]*variable: "--font-sans"/);
});

// 2. Status registry ------------------------------------------------------------------------
console.log("Status registry");
const salesContracts = read("lib/sales/contracts.ts");
const entityList = salesContracts.slice(salesContracts.indexOf("export const listStatuses"));
const salesStatuses = (key: string) => {
  const m = entityList.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  assert.ok(m, `statuses for ${key} not found in lib/sales/contracts.ts listStatuses`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
};
const taskEnum = [...(read("database/schema/tasks.ts").match(/enum: \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
const purchaseStatuses = [...(read("lib/design-purchases/model.ts").match(/purchaseStatuses = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
const invoicePayment = [...(entityList.match(/invoicePaymentStates = \[[^\]]*\]/)?.[0] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
const sources: Record<keyof typeof statusRegistry, readonly string[]> = {
  lead: leadStatuses,
  payment: paymentStatuses,
  expense: expenseStatuses,
  client: salesStatuses("clients"),
  project: salesStatuses("projects"),
  quotation: salesStatuses("quotations"),
  invoice: salesStatuses("invoices"),
  delivery: salesStatuses("deliveries"),
  invoicePayment,
  task: taskEnum,
  designPurchase: purchaseStatuses,
  // Staff directory statuses (lib/admin/staff.ts StaffRow.status) plus the "invited" filter value on the Staff page.
  staff: [...[...(read("lib/admin/staff.ts").match(/status: ("[a-z]+"(?: \| "[a-z]+")+);/)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((x) => x[1]), "invited"],
};
for (const [domain, values] of Object.entries(sources)) {
  check(`${domain}: ${values.length} statuses covered`, () => {
    assert.ok(values.length > 0, "no source values found");
    const registry = statusRegistry[domain as keyof typeof statusRegistry] as Record<string, unknown>;
    const missing = values.filter((v) => !(v in registry));
    assert.deepEqual(missing, [], `missing: ${missing.join(", ")}`);
  });
}
check("unknown statuses fall back to a readable neutral label", () => {
  assert.deepEqual(resolveStatus("quotation", "awaiting_signature"), { label: "Awaiting signature", tone: "neutral" });
  assert.equal(resolveStatus("quotation", "accepted").label, "Confirmed");
});

// 3. Formatters -----------------------------------------------------------------------------
console.log("Formatters");
check("money", () => {
  assert.equal(formatMoney("UGX", "1250000"), "UGX 1,250,000");
  assert.equal(formatMoney("UGX", 1250000.6), "UGX 1,250,001");
  assert.equal(formatMoney("usd", 1250.5), "USD 1,250.50");
  assert.equal(formatMoney("UGX", -5000), "−UGX 5,000");
  assert.equal(formatMoney("UGX", 5000, { signed: true }), "+UGX 5,000");
  assert.equal(formatMoney("UGX", 1_200_000, { compact: true }), "UGX 1.2M");
  assert.equal(formatMoney("UGX", null), "—");
  assert.equal(formatMoney("UGX", ""), "—");
  assert.equal(formatMoney("UGX", "abc"), "—");
  assert.equal(formatMoney("UGX", 0), "UGX 0");
});
check("numbers and percentages", () => {
  assert.equal(formatNumber(1204), "1,204");
  assert.equal(formatPercent(0.125, { signed: true }), "+12.5%");
  assert.equal(formatPercent(-0.036), "−3.6%");
});
check("dates use Kampala time", () => {
  assert.equal(formatDate("2026-11-19"), "19 Nov 2026");
  // 22:30 UTC on the 19th is already the 20th in Kampala (UTC+3).
  assert.equal(formatDate("2026-11-19T22:30:00Z"), "20 Nov 2026");
  assert.match(formatDateTime("2026-11-19T11:05:00Z"), /19 Nov 2026,? 14:05/);
  assert.equal(formatMonth("2026-11"), "Nov 2026");
  // Postgres text timestamps: space separator and a short "+00" offset.
  assert.equal(formatDateTime("2026-10-06 06:52:31.904619+00"), formatDateTime("2026-10-06T06:52:31.904Z"));
  assert.match(formatDateTime("2026-10-06 06:52:31.904619+00"), /6 Oct 2026,? 09:52/);
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("not a date"), "—");
});
check("chart helpers never fabricate deltas", () => {
  assert.equal(periodChange(120, 100), 0.2);
  assert.equal(periodChange(120, 0), null);
  assert.equal(periodChange(120, null), null);
  assert.equal(periodChange(120, 100, { complete: false }), null);
  assert.equal(tickInterval(12, 6), 1);
  assert.equal(tickInterval(5, 6), 0);
});

// 3b. Tables and chart reconciliation (Phase 3) ---------------------------------------------
console.log("Tables");
const cols = [
  { id: "number", essential: true },
  { id: "title" },
  { id: "division", defaultHidden: true },
  { id: "updated", defaultHidden: true },
];
check("column preferences: defaults, stored values, essentials and corrupt data", () => {
  assert.deepEqual(resolveHidden(null, cols), ["division", "updated"]);
  assert.deepEqual(resolveHidden(JSON.stringify({ hidden: ["title"] }), cols), ["title"]);
  assert.deepEqual(resolveHidden(JSON.stringify({ hidden: ["number", "gone", 3] }), cols), [], "essential/unknown ids are dropped");
  assert.deepEqual(resolveHidden("{not json", cols), ["division", "updated"]);
  assert.deepEqual(resolveHidden(JSON.stringify({ hidden: "title" }), cols), ["division", "updated"]);
});
check("column preferences are scoped by table, organization and user", () => {
  assert.equal(preferenceKey("quotations", "org_1", "user_a"), "calacot.table.quotations.v1.org_1.user_a");
  assert.notEqual(preferenceKey("quotations", "org_1", "user_a"), preferenceKey("quotations", "org_1", "user_b"));
  assert.equal(preferenceKey("quotations", null, "user_a"), "calacot.table.quotations.v1.personal.user_a");
});
check("numbered pagination window", () => {
  assert.deepEqual(pageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(1, 20), [1, 2, "gap", 20]);
  assert.deepEqual(pageWindow(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
  assert.deepEqual(pageWindow(20, 20), [1, "gap", 19, 20]);
});
check("quotations page keeps the list URL contract", () => {
  const page = read("app/(admin)/admin/quotations/page.tsx");
  assert.ok(page.includes("parseQuery(raw)"), "page must parse the URL with parseQuery");
  assert.ok(page.includes('readList("quotations", query)'), "page must read through readList (permissions and org scope)");
  const table = read("components/sales/quotations-table.tsx");
  for (const key of ["status", "currency", "division", "from", "to"]) assert.ok(table.includes(`key: "${key}"`) || table.includes(`${key}: query.${key}`), `filter ${key} missing`);
  for (const sort of ["number", "name", "status", "total", "due", "created"]) assert.ok(table.includes(`sortKey: "${sort}"`), `sort ${sort} missing`);
});

console.log("Chart reconciliation");
const fixture: MonthlyActivityRow[] = [
  { month: "2026-09", currency: "UGX", invoiced: "1000000", receipts: "400000", approved: "250000", disbursed: "100000" },
  { month: "2026-11", currency: "UGX", invoiced: "500000.50", receipts: "900000", approved: "0", disbursed: "50000" },
  { month: "2026-10", currency: "USD", invoiced: "1200.25", receipts: "300", approved: "80", disbursed: "80" },
  { month: "2026-11", currency: "USD", invoiced: "not-a-number", receipts: "10", approved: "0", disbursed: "0" },
];
const period = { from: "2026-09-15", to: "2026-11-30", today: "2026-11-19" };
const series = monthlySeries(fixture, period);
check("one series per currency; UGX and USD never combined", () => {
  assert.deepEqual(series.map((s) => s.currency), ["UGX", "USD"]);
});
check("series totals equal the report rows (reconciliation)", () => {
  for (const s of series) {
    for (const k of ["invoiced", "receipts", "approved", "disbursed"] as const) {
      const expected = fixture.filter((r) => r.currency === s.currency).reduce((n, r) => n + (Number.isFinite(Number(r[k])) ? Number(r[k]) : 0), 0);
      assert.ok(Math.abs(s.totals[k] - expected) < 1e-6, `${s.currency} ${k}: chart ${s.totals[k]} vs table ${expected}`);
    }
  }
});
check("every month in the period is present, in order", () => {
  assert.deepEqual(monthRange("2026-09-15", "2026-11-30"), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(monthRange("2025-12-01", "2026-01-31"), ["2025-12", "2026-01"]);
  for (const s of series) assert.deepEqual(s.points.map((p) => p.month), ["2026-09", "2026-10", "2026-11"]);
});
check("absent months are zero (query covers all sources); unparseable values stay null", () => {
  const ugxOct = series[0].points[1];
  assert.equal(ugxOct.invoiced, 0);
  const usdNov = series[1].points[2];
  assert.equal(usdNov.invoiced, null, "invalid value must not become 0");
  assert.equal(usdNov.receipts, 10);
});
check("partial months are flagged at the period edges and for the current month", () => {
  assert.deepEqual(series[0].points.map((p) => p.partial), [true, false, true]);
});
check("drill-down periods are clamped to the report period", () => {
  assert.deepEqual(monthPeriod("2026-09", period), { from: "2026-09-15", to: "2026-09-30" });
  assert.deepEqual(monthPeriod("2026-10", period), { from: "2026-10-01", to: "2026-10-31" });
});

// 3b2. Workflow derivations moved into lib (Phase 5) ----------------------------------------
console.log("Workflow rules");
check("a sent quotation past its validity date is expired; nothing else changes", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(effectiveQuotationStatus("sent", "2026-11-19T23:59:59Z", now), "expired");
  assert.equal(effectiveQuotationStatus("sent", "2026-11-20T12:00:00Z", now), "expired", "expires at the validity instant, like the list query (<= now)");
  assert.equal(effectiveQuotationStatus("sent", "2026-11-21T00:00:00Z", now), "sent");
  assert.equal(effectiveQuotationStatus("draft", "2020-01-01", now), "draft");
  assert.equal(effectiveQuotationStatus("accepted", "2020-01-01", now), "accepted");
  assert.equal(effectiveQuotationStatus("sent", null, now), "sent");
  assert.equal(effectiveQuotationStatus("sent", "not a date", now), "sent");
});
check("the list query uses the same expiry rule", () => {
  assert.match(read("lib/sales/queries.ts"), /CASE WHEN v\.status='sent' AND v\.valid_until<=now\(\) THEN 'expired'/);
});

// 3c. Admin shell (Phase 4) -----------------------------------------------------------------
console.log("Admin shell");
const adminPages: string[] = [];
const collectPages = (dir: string) => {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) collectPages(rel);
    else if (/\.tsx$/.test(entry)) adminPages.push(rel);
  }
};
collectPages("app/(admin)/admin");
check("exactly one <main>, owned by the admin layout", () => {
  const layoutSource = read("app/(admin)/layout.tsx");
  assert.equal(layoutSource.match(/<main\b/g)?.length, 1, "layout must render one <main>");
  assert.ok(layoutSource.includes('id="main-content"') && layoutSource.includes('href="#main-content"'), "skip link must target #main-content");
  const offenders = [...adminPages, "components/sales/list-page.tsx"].filter((f) => /<main\b/.test(read(f)));
  assert.deepEqual(offenders, [], "pages must not render their own <main>");
  assert.ok(!/function SidebarInset[\s\S]{0,200}<main\b/.test(read("components/ui/sidebar.tsx")), "SidebarInset must not render <main>");
});
check("the shell header has no heading; every page provides exactly one <h1>", () => {
  assert.ok(!/<h[1-6]\b/.test(read("components/site-header.tsx")), "site header must not contain headings");
  const problems: string[] = [];
  for (const f of adminPages.filter((p) => p.endsWith("page.tsx"))) {
    const src = read(f);
    if (/^\s*redirect\(/m.test(src) && !/return\s*\(?\s*</.test(src)) continue; // redirect-only routes
    if (src.includes("SalesListPage")) continue; // renders PageHeader (checked below)
    const sources = (src.match(/<h1\b/g)?.length ?? 0) + (src.match(/as="h1"/g)?.length ?? 0) + (src.match(/<PageHeader\b/g)?.length ?? 0);
    if (sources !== 1) problems.push(`${f}: ${sources}`);
  }
  assert.ok(read("components/sales/list-page.tsx").includes("<PageHeader"), "SalesListPage must render a PageHeader (its h1)");
  assert.deepEqual(problems, [], "pages without exactly one h1 source");
});
check("breadcrumbs follow legacy and organization-scoped URLs", () => {
  assert.deepEqual(adminBreadcrumbs("/admin/quotations"), [{ label: "Quotations", href: "/admin/quotations" }]);
  assert.deepEqual(adminBreadcrumbs("/calacot-group/admin/quotations/4c8224af-65e8-4f9b-9ed2-82b3f3d85b4e"), [
    { label: "Quotations", href: "/calacot-group/admin/quotations" },
    { label: "Quotation", href: "/calacot-group/admin/quotations/4c8224af-65e8-4f9b-9ed2-82b3f3d85b4e" },
  ]);
  assert.deepEqual(adminBreadcrumbs("/admin/expenses/abc/edit").map((c) => c.label), ["Expenses", "Expense request", "Edit"]);
  assert.deepEqual(adminBreadcrumbs("/admin/design-purchases").map((c) => c.label), ["Design Orders"]);
  assert.deepEqual(adminBreadcrumbs("/sign-in"), []);
});
check("active navigation matches the section and its children only", () => {
  assert.ok(isActivePath("/calacot-group/admin/quotations/123", "/calacot-group/admin/quotations"));
  assert.ok(isActivePath("/admin/quotations/", "/admin/quotations"));
  assert.ok(!isActivePath("/admin/quotations-archive", "/admin/quotations"), "prefix of a different segment must not match");
  assert.ok(!isActivePath("/admin/payments", "/admin/payment-accounts"));
});

// 4. Contrast -------------------------------------------------------------------------------
console.log("Contrast (WCAG 2.2 AA)");
type Lab = [number, number, number];
const oklchToOklab = (l: number, c: number, h: number): Lab => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
const oklabToLinearRgb = ([L, a, b]: Lab) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
};
const luminance = (lab: Lab) => {
  const [r, g, b] = oklabToLinearRgb(lab);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x: Lab, y: Lab) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (x: Lab, y: Lab, xShare: number): Lab => [0, 1, 2].map((i) => x[i] * xShare + y[i] * (1 - xShare)) as Lab;
const tokenIn = (block: string, name: string): Lab => {
  // Lightness may be written as 0.47 or 47.41% (the brand shade scales use percentages).
  const m = block.match(new RegExp(`${name}:\\s*oklch\\(([\\d.]+)(%?) ([\\d.]+) ([\\d.]+)`));
  assert.ok(m, `token ${name} not found as a literal oklch value`);
  const l = m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]);
  return oklchToOklab(l, Number(m[3]), Number(m[4]));
};
const v1 = css.slice(css.indexOf("Calacot Admin Design System V1"));
const lightBlock = v1.slice(v1.indexOf(":root {"), v1.indexOf(".dark {"));
const darkBlock = v1.slice(v1.indexOf(".dark {"), v1.indexOf(':root:has([data-surface="admin"]) {'));
const white: Lab = oklchToOklab(1, 0, 0);
const brandBlack = oklchToOklab(0.1941, 0.012, 285.23);
const brandWhite = oklchToOklab(0.9741, 0.008, 278.64);
const gold = oklchToOklab(0.8598, 0.1719, 88.44);
const darkCard = mix(brandBlack, white, 0.95);
const lightDestructive = tokenIn(css.slice(0, css.indexOf(".dark {")), "--destructive");
const darkDestructive = tokenIn(css.slice(css.indexOf(".dark {")), "--destructive");
const pairs: [string, Lab, Lab, number][] = [];
for (const [tone, share] of [["--success", 0.12], ["--warning", 0.14], ["--info", 0.12]] as const) {
  const light = tokenIn(lightBlock, tone);
  const dark = tokenIn(darkBlock, tone);
  pairs.push([`${tone} text on light card`, light, white, 4.5]);
  pairs.push([`${tone} text on its light soft badge`, light, mix(light, white, share), 4.5]);
  pairs.push([`${tone} text on dark card`, dark, darkCard, 4.5]);
  pairs.push([`${tone} text on its dark soft badge`, dark, mix(dark, darkCard, 0.16), 4.5]);
}
pairs.push(["destructive-text on the light destructive soft badge", tokenIn(lightBlock, "--destructive-text"), mix(lightDestructive, white, 0.1), 4.5]);
pairs.push(["destructive text on dark card", darkDestructive, darkCard, 4.5]);
pairs.push(["primary button label (brand black on gold)", brandBlack, gold, 4.5]);
pairs.push(["admin focus ring on light canvas (non-text)", tokenIn(v1, "--ring"), brandWhite, 3]);
pairs.push(["gold focus ring on dark canvas (non-text)", gold, brandBlack, 3]);
// Public site text shades (replacing opacity-based colours) and the brand-tinted muted text.
const onyx = (step: string) => tokenIn(css, `--color-brand-black-${step}`);
pairs.push(["brand-black-600 secondary text on brand-white", onyx("600"), brandWhite, 4.5]);
pairs.push(["brand-black-600 secondary text on white", onyx("600"), white, 4.5]);
pairs.push(["brand-black-700 text on brand-white", onyx("700"), brandWhite, 4.5]);
pairs.push(["brand-black-200 secondary text on brand-black", onyx("200"), brandBlack, 4.5]);
pairs.push(["brand-black-300 tertiary text on brand-black", onyx("300"), brandBlack, 4.5]);
pairs.push(["brand-black-400 faint text on brand-black", onyx("400"), brandBlack, 4.5]);
pairs.push(["muted text (dark) on admin dark card", onyx("300"), darkCard, 4.5]);
pairs.push(["primary-800 eyebrow text on brand-white", tokenIn(css, "--color-brand-primary-800"), brandWhite, 4.5]);
pairs.push(["light chart primary vs card (graphics, 1.4.11)", tokenIn(lightBlock, "--chart-primary"), white, 3]);
for (const [name, fg, bg, min] of pairs) {
  check(`${name} >= ${min}:1`, () => {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= min, `ratio ${ratio.toFixed(2)}:1`);
  });
}
// The existing light --destructive (shadcn) passes on plain cards; tinted badges use --destructive-text.
const lightDestructiveOnWhite = contrast(lightDestructive, white);
console.log(`  info destructive text on light card is ${lightDestructiveOnWhite.toFixed(2)}:1`);

// 4b. Public site (brand shades, no off-brand colours) ------------------------------------------
console.log("Public site");
const publicRoots = [
  "components/architecture", "components/painting", "components/real-estate", "components/tech",
  "components/interior-design", "components/forms", "app/(home)", "app/(real-estate)", "app/(calacot-tech)",
  "app/contact", "app/schedule-call", "app/start-project", "app/thank-you", "app/list-property",
  "app/privacy-policy", "app/account", "app/access-pending",
];
const publicFiles: string[] = [];
const walkPublic = (dir: string) => {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) walkPublic(rel);
    else if (/\.tsx?$/.test(entry)) publicFiles.push(rel);
  }
};
publicRoots.forEach(walkPublic);
["footer", "navbar", "hero-section", "possibility-section", "estates-section", "world-view-section", "construction-process-section", "showcase-slider"].forEach((n) => publicFiles.push(`components/${n}.tsx`));
const offenders = (re: RegExp) => publicFiles.filter((f) => re.test(read(f)));
check("public pages use brand shades, not opacity, for text", () => {
  assert.deepEqual(offenders(/\btext-brand-(black|white)\/\d+/), []);
  assert.deepEqual(offenders(/(?:^|[\s"'`:])text-(?:white|black)(?:\/\d+)?(?=[\s"'`]|$)/m), [], "use text-brand-white / text-brand-black or an onyx shade");
});
check("small uppercase labels use the shared eyebrow style", () => {
  const size = /^(?:text-xs|text-\[(?:9|10|11)px\]|text-\[0\.\d+rem\])$/;
  const track = /^tracking-(?:\[[^\]]+\]|wide|wider|widest)$/;
  const handRolled = publicFiles.filter((f) =>
    [...read(f).matchAll(/className="([^"]*)"/g)].some(([, cls]) => {
      const t = cls.split(/\s+/).filter((x) => !x.includes(":"));
      return t.includes("uppercase") && t.some((x) => size.test(x)) && t.some((x) => track.test(x));
    }),
  );
  assert.deepEqual(handRolled, [], "use type-eyebrow");
});
check("public pages use no off-brand palette colours or hard-coded hex colours", () => {
  assert.deepEqual(offenders(/\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:amber|emerald|green|red|blue|yellow|orange|sky|rose|zinc|slate|gray|stone|violet|purple|lime|indigo|teal)-\d{2,3}\b|#[0-9a-fA-F]{6}\b/), []);
});
const adminFiles: string[] = [];
const walkAdmin = (dir: string) => {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) walkAdmin(rel);
    else if (/\.tsx$/.test(entry)) adminFiles.push(rel);
  }
};
["app/(admin)", "components/admin", "components/finance", "components/sales", "components/feedback", "components/layout"].forEach(walkAdmin);
check("admin cards and nested panels use the card radius tokens", () => {
  // Containers only: inputs and selects keep rounded-md because they are controls, not cards.
  const raw = /<(?:div|section|details|p|li|FieldSet)\b[^>]*className="[^"]*\brounded-(?:md|lg|xl) border(?: bg-(?:card|surface-subtle|muted\/40))?(?: px?-\d)/;
  assert.deepEqual(adminFiles.filter((f) => raw.test(read(f))), [], "use surface-card or rounded-(--card-radius-inner) border-card-edge bg-card-nested");
});
check("toasts only use types the toast system understands", () => {
  const all = publicFiles.filter((f) => /type: "destructive"/.test(read(f)));
  assert.deepEqual(all, [], 'use type: "error"');
});
check("muted text is a brand shade in both themes", () => {
  assert.match(css, /--muted-foreground: var\(--color-brand-black-600\)/);
  assert.match(css, /--muted-foreground: var\(--color-brand-black-300\)/);
});

// 5. Regression scan --------------------------------------------------------------------------
console.log("Admin regression scan");
const adminRoots = ["app/(admin)", "components/admin", "components/sales", "components/finance", "components/documents", "components/catalogue", "components/reports", "components/layout", "components/feedback", "components/charts"];
const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) walk(rel);
    else if (/\.tsx?$/.test(entry)) files.push(rel);
  }
};
adminRoots.forEach(walk);
const count = (re: RegExp) => files.reduce((n, f) => n + (read(f).match(re)?.length ?? 0), 0);
// Baselines measured when Phase 2 landed (19 Nov 2026). They may only go down as modules migrate.
const baselines = {
  "raw Tailwind palette colours": [/\b(?:bg|text|border|ring|fill|stroke)-(?:amber|emerald|green|red|blue|yellow|orange|sky|rose|zinc|slate|gray|neutral|stone|violet|lime)-\d{2,3}/g, 0],
  "arbitrary font sizes": [/\btext-\[\d+(?:\.\d+)?px\]/g, 0],
  "native <select> elements": [/<select\b/g, 0],
} as const;
for (const [name, [re, max]] of Object.entries(baselines)) {
  check(`${name}: at most ${max}`, () => {
    const n = count(re);
    assert.ok(n <= max, `${n} found (baseline ${max}); use tokens, type-* utilities or NativeSelect`);
    if (n < max) console.log(`       now ${n}; lower the baseline to lock in the improvement`);
  });
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll design system checks passed.");
