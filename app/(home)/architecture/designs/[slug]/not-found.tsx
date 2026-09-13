import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default function DesignNotFound() {
  return <div className="mx-auto max-w-2xl px-6 py-36 text-center">
    <h1 className="text-4xl tracking-tight">Design not found</h1>
    <p className="mt-4 opacity-65">This design may no longer be available.</p>
    <Link href="/architecture/designs" className={buttonVariants({ variant: "default", size: "lg", className: "mt-8" })}>Explore designs</Link>
  </div>;
}
