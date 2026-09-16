// Local-only visual verification; no customer data or external services are used.
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolve } from "node:path";

for (const name of ["design-invoice", "design-invoice-long"]) {
  const task = getDocument({
    data: new Uint8Array(await readFile(`tmp/pdfs/${name}.pdf`)),
    useSystemFonts: false,
    standardFontDataUrl:
      resolve("node_modules/pdfjs-dist/standard_fonts") + "/",
  });
  const document = await task.promise;
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n);
    const viewport = page.getViewport({ scale: 1.3 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      canvas: null,
    }).promise;
    await writeFile(`tmp/pdfs/${name}-${n}.png`, canvas.toBuffer("image/png"));
  }
  await task.destroy();
}
