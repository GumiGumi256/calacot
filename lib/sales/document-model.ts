import type { MoneyLine } from "./money";
export type DocumentSnapshot = {
  type: "quotation" | "invoice";
  number: string;
  version: number;
  title: string;
  project: string;
  clientId: string;
  projectId: string;
  quotationVersionId: string;
  currency: "UGX" | "USD";
  customer: {
    name: string;
    address: string;
    taxIdentifier: string;
    email: string;
  };
  issuer: {
    legalName: string;
    address: string;
    email: string;
    phone: string;
    taxIdentifier: string;
  };
  scope: string;
  deliverables: string[];
  exclusions: string[];
  terms: string;
  instructions: string;
  items: (MoneyLine & {
    position: number;
    subtotal: string;
    taxAmount: string;
    total: string;
  })[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  schedules: { label: string; amount: string; dueAt: string }[];
  issuedAt: string;
  due: string;
  billingPolicy: "full" | "deposit";
  billingPurpose: string;
  invoiceDueDays?: number;
  brand: {
    template: string;
    logo: string;
    logoSha256: string;
    logoBase64: string;
  };
};
