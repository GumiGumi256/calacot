import {readFile,writeFile} from "node:fs/promises";
import {createCanvas} from "@napi-rs/canvas";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolve } from "node:path";
for (const name of ["sales-invoice", "sales-invoice-long", "sales-quotation-draft"]) {
  const task = getDocument({
    data: new Uint8Array(await readFile(`tmp/pdfs/${name}.pdf`)),
    useSystemFonts: false,
    standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts").replaceAll("\\", "/") + "/",
  });
  const doc = await task.promise;
  console.log(name, doc.numPages, "pages");
  let all = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas: null }).promise;
    await writeFile(`tmp/pdfs/${name}-${n}.png`, canvas.toBuffer("image/png"));
    all += (await page.getTextContent()).items.map(item => item.str || "").join(" ");
  }
  if (!all.includes(`Page ${doc.numPages} of ${doc.numPages}`) || all.includes("Private notes")) {
    throw new Error("PDF content validation failed");
  }
  await task.destroy();
}
