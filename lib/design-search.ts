export type SearchableDesign = {
  _id: string;
  title: string;
  designType: string | null;
  architecturalStyle: string | null;
  bedrooms: number | null;
};

const words = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];

// Damerau-Levenshtein also tolerates adjacent transpositions, e.g. "modren".
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

export function rankDesigns(designs: SearchableDesign[], query: string): string[] {
  const terms = words(query);
  if (!terms.length) return [];
  return designs.map((design) => {
    const tokens = words([design.title, design.designType, design.architecturalStyle,
      design.bedrooms == null ? "" : `${design.bedrooms} bed beds bedroom bedrooms`,
    ].filter(Boolean).join(" "));
    const scores = terms.map((term) => Math.min(...tokens.map((token) => {
      if (term === token) return 0;
      if (/^\d+$/.test(term)) return Infinity;
      if (term.length >= 2 && token.startsWith(term)) return 0.25;
      const tolerance = term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0;
      if (Math.abs(term.length - token.length) > tolerance) return Infinity;
      const edits = distance(term, token);
      return edits <= tolerance ? edits : Infinity;
    })));
    return { id: design._id, score: scores.reduce((sum, score) => sum + score, 0) };
  }).filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score)
    .map(({ id }) => id);
}
