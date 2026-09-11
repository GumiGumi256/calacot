import { pageMetadata } from "@/lib/seo";
import StartProjectForm from "@/components/forms/start-project-form";
import { getDesignBySlug } from "@/lib/queries/design";
import { absoluteUrl } from "@/lib/seo";

export const metadata = pageMetadata("/start-project");

export default async function StartProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; design?: string; package?: string }>;
}) {
  const { service, design: slug, package: packageKey } = await searchParams;
  const design = typeof slug === "string" ? await getDesignBySlug(slug) : null;
  const selectedPackage = design?.packages.find((item) => item._key === packageKey);
  const initialOverview = design
    ? `I would like to buy ${design.title}${design.designCode ? ` (${design.designCode})` : ""}.${selectedPackage ? ` Package: ${selectedPackage.package.name}, UGX ${selectedPackage.price.toLocaleString("en-UG")}.` : ""}\nDesign: ${absoluteUrl(`/architecture/designs/${encodeURIComponent(design.slug)}`)}`
    : undefined;

  return (
    <main className="container py-20">
      <StartProjectForm initialService={design ? "architecture" : service} initialOverview={initialOverview} />
    </main>
  );
}
