// @/lib/design-purchases/model.ts

export function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "completed":
    case "paid":
    case "verified":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800";

    case "payment_submitted":
    case "pending":
    case "processing":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800";

    case "action_required":
    case "failed":
    case "cancelled":
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800";

    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  }
}