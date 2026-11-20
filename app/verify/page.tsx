import type { Metadata } from "next";
import { PublicVerification } from "@/components/documents/public-verification";

export const metadata: Metadata = { title: "Verify a document", robots: { index: false, follow: false } };
export default function VerifyPage() { return <PublicVerification />; }
