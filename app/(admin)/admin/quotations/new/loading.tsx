import { CardSkeleton } from "@/components/feedback/skeletons";

// Overrides the list skeleton from ../loading.tsx while the quotation builder loads.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="type-page-title">New quotation</h1>
      <CardSkeleton lines={8} />
    </div>
  );
}
