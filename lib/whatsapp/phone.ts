import { parsePhoneNumber } from "react-phone-number-input";

/** Canonical Cloud API recipient: international country code and digits, no +. */
export function normalizeWhatsAppPhone(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 40 || /[^+\d\s().-]/.test(input)) return null;
  const digits = input.replace(/\D/g, "");
  const international = input.startsWith("+") ? input : input.startsWith("00") ? `+${digits.slice(2)}` : !digits.startsWith("0") && digits.length > 9 ? `+${digits}` : input;
  const phone = parsePhoneNumber(international, "UG");
  return phone?.isValid() ? phone.number.slice(1) : null;
}
