import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { resolveStatus, type StatusDomain, type StatusTone } from "@/lib/ui/status"

const toneVariant: Record<StatusTone, "success" | "warning" | "info" | "neutral" | "danger"> = {
  success: "success",
  warning: "warning",
  info: "info",
  neutral: "neutral",
  destructive: "danger",
}

/**
 * The one way to show a workflow status. Text label plus a tone and a dot, so status is never
 * communicated by colour alone. Labels and tones come from lib/ui/status.ts.
 */
function StatusBadge({
  domain,
  status,
  className,
}: {
  domain: StatusDomain
  status: string | null | undefined
  className?: string
}) {
  const { label, tone } = resolveStatus(domain, status)
  return (
    <Badge variant={toneVariant[tone]} data-tone={tone} className={cn("gap-1.5", className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </Badge>
  )
}

export { StatusBadge }
