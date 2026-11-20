/*
 * Public business details ("NAP": name, address, phone) used by structured data and the footer.
 * Search engines rank local businesses partly on these being present and identical everywhere
 * (website, Google Business Profile, directories). Values come from deployment settings so they
 * can be filled in without a code change; anything not set is left out, never guessed.
 *
 *   CALACOT_PUBLIC_PHONE    e.g. +256 700 000000
 *   CALACOT_PUBLIC_EMAIL    e.g. info@calacot.com
 *   CALACOT_PUBLIC_STREET   e.g. Plot 12, Example Road
 *   CALACOT_PUBLIC_AREA     e.g. Kololo (neighbourhood)
 *   CALACOT_PUBLIC_POSTCODE optional
 *   CALACOT_PUBLIC_HOURS    e.g. Mo-Fr 08:00-17:00, Sa 09:00-13:00
 *   CALACOT_PUBLIC_GEO      e.g. 0.3301,32.5880 (latitude,longitude)
 */
const read = (key: string) => process.env[key]?.trim() || "";

export const business = {
  name: "Calacot",
  legalName: "Calacot Uganda Limited",
  city: "Kampala",
  region: "Central Region",
  country: "UG",
  countryName: "Uganda",
  phone: read("CALACOT_PUBLIC_PHONE"),
  email: read("CALACOT_PUBLIC_EMAIL"),
  street: read("CALACOT_PUBLIC_STREET"),
  area: read("CALACOT_PUBLIC_AREA"),
  postcode: read("CALACOT_PUBLIC_POSTCODE"),
  hours: read("CALACOT_PUBLIC_HOURS"),
  geo: (() => {
    const m = read("CALACOT_PUBLIC_GEO").match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
  })(),
  /** Official profiles; sameAs tells search engines these all belong to Calacot. */
  profiles: [
    "https://instagram.com/calacotug",
    "https://tiktok.com/@calacotug",
    "https://youtube.com/@Calacot",
    "https://linkedin.com/in/calacotug",
    "https://x.com/calacotug",
  ],
  /** Services, in the words people search with. */
  services: [
    "Architectural design",
    "House plans",
    "Interior design",
    "Interior and exterior painting",
    "Real estate sales and rentals",
    "Property marketing",
    "Software development",
  ],
} as const;

/** "Mo-Fr 08:00-17:00, Sa 09:00-13:00" -> schema.org OpeningHoursSpecification entries. */
export function openingHours(spec = business.hours) {
  const days: Record<string, string> = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" };
  const order = Object.keys(days);
  return spec.split(",").map((part) => part.trim().match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/)).flatMap((m) => {
    if (!m || !days[m[1]] || (m[2] && !days[m[2]])) return [];
    const from = order.indexOf(m[1]);
    const to = m[2] ? order.indexOf(m[2]) : from;
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: order.slice(from, to + 1).map((d) => days[d]), opens: m[3], closes: m[4] }];
  });
}
