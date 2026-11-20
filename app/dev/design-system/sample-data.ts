// Development gallery only (the page 404s in production). Illustrative values, not business data.
import type { QuotationRow } from "@/components/sales/quotations-table";
import type { MonthlyActivityRow } from "@/lib/charts/series";

const statuses = ["draft", "sent", "accepted", "sent", "expired", "declined", "accepted", "superseded", "sent", "draft"];
const clients = ["Nakawa Estates Ltd", "Akello Mirembe", "Kololo Heights Residents Association", "Jinja Road Interiors", "Entebbe Lakeside Villas"];
const titles = [
  "Interior fit-out, 3-bedroom apartment",
  "Exterior repaint and waterproofing",
  "Architectural drawings for a four-storey commercial block with basement parking",
  "Office partitioning",
  "Kitchen remodel",
];

export const sampleQuotations: QuotationRow[] = statuses.map((status, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  client_id: `10000000-0000-4000-8000-${String((i % 5) + 1).padStart(12, "0")}`,
  name: titles[i % titles.length],
  number: `${status === "draft" ? "Draft" : `Q-2026-${String(140 - i).padStart(3, "0")}`} / R${(i % 3) + 1}`,
  client: clients[i % clients.length],
  project: `${["Estates", "Painting", "Architecture", "Interiors"][i % 4]} project ${i + 1}`,
  status,
  currency: i % 4 === 3 ? "USD" : "UGX",
  total: i % 4 === 3 ? String(4_850.5 + i * 120) : String(12_500_000 + i * 3_250_000),
  due: `2026-${String(10 + (i % 3)).padStart(2, "0")}-${String(5 + i).padStart(2, "0")}`,
  created: `2026-11-${String(18 - i).padStart(2, "0")}T09:30:00.000Z`,
  email: "",
  phone: "",
  delivery: ["—", "delivered", "read", "failed", "queued"][i % 5],
  balance: "",
  payment: "",
  kind: "",
  division: ["estates", "painting", "architecture", "interiors"][i % 4],
  activeProjects: 0,
}));

export const sampleMonthly: MonthlyActivityRow[] = [
  ["2026-06", "182000000", "151000000", "96000000", "90000000"],
  ["2026-07", "204000000", "176000000", "102000000", "99000000"],
  ["2026-08", "168000000", "171000000", "118000000", "110000000"],
  // September deliberately absent: no activity, drawn as zero.
  ["2026-10", "247000000", "214000000", "121000000", "104000000"],
  ["2026-11", "139000000", "122000000", "74000000", "51000000"],
].map(([month, invoiced, receipts, approved, disbursed]) => ({ month, currency: "UGX", invoiced, receipts, approved, disbursed }));
sampleMonthly.push(
  { month: "2026-08", currency: "USD", invoiced: "12400", receipts: "9100", approved: "2100", disbursed: "2100" },
  { month: "2026-11", currency: "USD", invoiced: "8300.5", receipts: "4050", approved: "900", disbursed: "0" },
);
