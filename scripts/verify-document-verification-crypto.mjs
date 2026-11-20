import assert from "node:assert/strict";
import { matchesPdfDigest, newVerificationReference, pdfDigest, referenceDigest } from "../lib/documents/verification-crypto.ts";

const references = Array.from({ length: 1000 }, newVerificationReference);
assert.equal(new Set(references).size, references.length);
assert.ok(references.every((reference) => referenceDigest(reference)?.length === 64));
assert.equal(referenceDigest("abc"), null);
assert.equal(referenceDigest(`${references[0]}=`), null);
assert.equal(referenceDigest(`${references[0].slice(0, -1)}!`), null);

const pdf = Buffer.from("%PDF-1.7\nsynthetic document\n%%EOF\n");
const altered = Buffer.from(pdf);
altered[10] ^= 1;
const digest = pdfDigest(pdf);
assert.equal(matchesPdfDigest(pdf, digest), true);
assert.equal(matchesPdfDigest(altered, digest), false);
assert.equal(matchesPdfDigest(pdf, "not-a-digest"), false);
console.log("Document verification cryptography checks passed.");
