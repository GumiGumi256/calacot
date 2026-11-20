import "server-only";

export const documentMaxBytes = 20 * 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Content types served inline (everything else downloads as an attachment). */
export const inlineTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Detects the real file type from its content signature, never from the browser-declared
 * type. Office files must be OOXML zips with the expected part and no VBA macro project;
 * macro-enabled and legacy binary formats are refused.
 */
export function detectDocumentType(bytes: Buffer, fileName: string): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const body = bytes.toString("latin1");
    if (body.includes("vbaProject.bin") || body.includes("vbaData.xml")) return null;
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext === "docx" && body.includes("word/document.xml")) return DOCX;
    if (ext === "xlsx" && body.includes("xl/workbook.xml")) return XLSX;
  }
  return null;
}

export const extensionFor: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", [DOCX]: "docx", [XLSX]: "xlsx",
};

/** Safe display/download name: no path parts, control or quoting characters. */
export function safeFileName(name: string, mime: string) {
  const base = (name.split(/[\\/]/).pop() || "document").replace(/[^\w .()-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 150) || "document";
  const ext = extensionFor[mime];
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
}
