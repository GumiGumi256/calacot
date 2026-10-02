import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAmount(
  amount: number | string | null | undefined,
  currency = "UGX",
  locale = "en-UG"
): string {
  const numericAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount;

  if (numericAmount === null || numericAmount === undefined || Number.isNaN(numericAmount)) {
    return "—";
  }

  const normalizedCurrency = currency.toUpperCase();

  // Handle currencies that typically don't use decimal places (like UGX)
  const isZeroDecimalCurrency = ["UGX", "JPY", "KRW", "RWF", "TZS"].includes(normalizedCurrency);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: isZeroDecimalCurrency ? 0 : 2,
      maximumFractionDigits: isZeroDecimalCurrency ? 0 : 2,
    }).format(numericAmount);
  } catch {
    // Fallback formatting if an invalid currency code is passed
    return `${normalizedCurrency} ${numericAmount.toLocaleString(locale)}`;
  }
}