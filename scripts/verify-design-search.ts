import assert from "node:assert/strict";
import { rankDesigns, type SearchableDesign } from "../lib/design-search";

const designs: SearchableDesign[] = [
  { _id: "a", title: "Modern Courtyard", designType: "villa", architecturalStyle: "modern", bedrooms: 3 },
  { _id: "b", title: "Tropical Retreat", designType: "bungalow", architecturalStyle: "tropical", bedrooms: 4 },
  { _id: "c", title: "Villa Élan", designType: "villa", architecturalStyle: "contemporary", bedrooms: 13 },
];
assert.deepEqual(rankDesigns(designs, "modren vila"), ["a"]);
assert.deepEqual(rankDesigns(designs, "bunglow"), ["b"]);
assert.deepEqual(rankDesigns(designs, "3 bedrooms"), ["a"]);
assert.deepEqual(rankDesigns(designs, "13 bedrooms"), ["c"]);
assert.deepEqual(rankDesigns(designs, "elan"), ["c"]);
assert.deepEqual(rankDesigns(designs, "TROPICAL ret"), ["b"]);
assert.deepEqual(rankDesigns(designs, "modern bungalow"), []);
assert.deepEqual(rankDesigns(designs, "spaceship"), []);
assert.deepEqual(rankDesigns(designs, "!!!"), []);
assert.deepEqual(rankDesigns(designs, ""), []);
const many = Array.from({ length: 30 }, (_, i) => ({ ...designs[0], _id: String(i) }));
const ranked = rankDesigns(many, "modren");
assert.deepEqual([ranked.slice(0, 12).length, ranked.slice(12, 24).length, ranked.slice(24, 36).length], [12, 12, 6]);
assert.equal(new Set(ranked).size, 30);
assert.equal(rankDesigns([
  { ...designs[0], _id: "typo", title: "Modren", architecturalStyle: null },
  { ...designs[0], _id: "exact" },
], "modern")[0], "exact");
console.log("PASS: typos, transpositions, accents, prefixes, multi-term matching, exact bedroom numbers, relevance ordering, empty results, and pagination.");
