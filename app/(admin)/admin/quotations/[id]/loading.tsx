import { CardSkeleton } from "@/components/feedback/skeletons";

// Overrides the list skeleton from ../loading.tsx while a single quotation loads.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <CardSkeleton lines={4} />
      <CardSkeleton lines={6} />
    </div>
  );
}
