import { cn } from "@/lib/utils";
import { seriesRoles, type SeriesRole } from "@/lib/charts/config";

/**
 * Tiny dependency-free trend line for MetricCard. Decorative: the metric's own text carries the
 * meaning, so the SVG is hidden from assistive technology. Gaps (null) break the line rather
 * than being drawn as zero.
 */
export function Sparkline({
  values,
  role = "primary",
  width = 96,
  height = 28,
  className,
}: {
  values: (number | null)[];
  role?: SeriesRole;
  width?: number;
  height?: number;
  className?: string;
}) {
  const numbers = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (numbers.length < 2) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)}>
      <path d={d.trim()} fill="none" stroke={seriesRoles[role]} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
