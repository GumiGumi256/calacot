import { cacheLife } from "next/cache";

/**
 * The current year, for the footer. Reading the clock during prerendering needs a cache scope
 * under Cache Components; refreshed daily, so it rolls over on 1 January without a redeploy.
 */
export async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}
