/** NUMERIC(17,2): round half away from zero, per line, then sum. No float money. */
export function scaled(value: string, places = 2): bigint {
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(value))
    throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places)
    throw new Error(`At most ${places} decimal places allowed`);
  const result = BigInt(whole + fraction.padEnd(places, "0"));
  if (result > BigInt("99999999999999999"))
    throw new Error("Amount exceeds supported precision");
  return result;
}
export function decimal(value: bigint) {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}
export type MoneyLine = {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: string;
};
export function totals(lines: MoneyLine[], approvedTaxRate: string) {
  if (!lines.length || lines.length > 100)
    throw new Error("Use between 1 and 100 lines");
  const round = (v: bigint, divisor: bigint) =>
    (v + divisor / BigInt(2)) / divisor;
  const items = lines.map((line, position) => {
    const quantity = scaled(line.quantity, 4),
      price = scaled(line.unitPrice),
      discount = scaled(line.discountAmount),
      rate = scaled(line.taxRate);
    if (!quantity || rate > BigInt(10000) || rate !== scaled(approvedTaxRate))
      throw new Error("Invalid quantity or unapproved tax treatment");
    const subtotal = round(quantity * price, BigInt(10000));
    if (discount > subtotal) throw new Error("Discount exceeds subtotal");
    const tax = round((subtotal - discount) * rate, BigInt(10000));
    return {
      ...line,
      position,
      subtotal: decimal(subtotal),
      taxAmount: decimal(tax),
      total: decimal(subtotal - discount + tax),
    };
  });
  const sum = (key: "subtotal" | "discountAmount" | "taxAmount" | "total") =>
    decimal(items.reduce((s, i) => s + scaled(i[key]), BigInt(0)));
  const result = {
    items,
    subtotal: sum("subtotal"),
    discountAmount: sum("discountAmount"),
    taxAmount: sum("taxAmount"),
    total: sum("total"),
  };
  scaled(result.total);
  if (scaled(result.total) <= BigInt(0))
    throw new Error("Document total must be positive");
  return result;
}
