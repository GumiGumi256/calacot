import { getDesignCollection } from "@/lib/queries/design";
import DesignCollectionBrowser from "./design-collection-browser";

export default async function DesignCollection() {
  let initialPage = null;
  try {
    initialPage = await getDesignCollection();
  } catch (error) {
    console.error("Unable to load initial design collection", error);
  }
  return <DesignCollectionBrowser initialPage={initialPage} />;
}

export function DesignCollectionLoading() {
  return (
    <section className="section-space bg-secondary/30" aria-label="Design collection" aria-busy="true">
      <div className="site-container">
        <p role="status" className="mb-8 text-muted-foreground">Loading the design collection…</p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="aspect-[4/3] rounded-2xl bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    </section>
  );
}
