/** Log only machine-readable codes; database errors may include customer data. */
export function careFailureCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") break;
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string" && /^[A-Za-z0-9_]{2,40}$/.test(value.code))
      return value.code;
    current = value.cause;
  }
  return "processing_error";
}
