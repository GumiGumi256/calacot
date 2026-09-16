import { randomBytes } from "node:crypto";

export function createPurchaseReferences(now = new Date()) {
  const suffix = randomBytes(8).toString("hex").toUpperCase();
  return {
    purchaseReference: `CAL-DES-${suffix}`,
    invoiceNumber: `CAL-INV-${now.getUTCFullYear()}-${suffix}`,
  };
}
