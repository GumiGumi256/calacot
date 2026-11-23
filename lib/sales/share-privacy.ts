/** Bearer URLs must not be copied into monitoring events or breadcrumbs. */
export function containsSharedDocumentUrl(value: unknown) {
  try { return /\/(?:shared|api\/sales\/shared)\/[a-f0-9]{64}/i.test(JSON.stringify(value)); } catch { return true; }
}
