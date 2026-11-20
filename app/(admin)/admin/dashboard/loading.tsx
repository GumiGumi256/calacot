import { MetricSkeleton, CardSkeleton } from "@/components/feedback/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="type-page-title">Dashboard</h1>
      <CardSkeleton lines={2} />
      <MetricSkeleton count={6} className="xl:grid-cols-3" />
    </div>
  );
}
