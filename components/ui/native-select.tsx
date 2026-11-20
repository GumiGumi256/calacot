import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A real <select> with the same geometry and focus ring as Input and Select.
 * Use it in server-rendered GET forms (filters) that must work without JavaScript;
 * use components/ui/select.tsx everywhere else.
 */
function NativeSelect({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  /** Width and layout of the field, e.g. "w-full" in stacked forms. The select fills it. */
  wrapperClassName?: string
}) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-fit min-w-0", wrapperClassName)}>
      <select
        data-slot="native-select"
        className={cn(
          "h-(--control-h) w-full min-w-0 appearance-none rounded-(--control-radius) border border-input bg-transparent py-2 pr-9 pl-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 admin:focus-visible:ring-2 admin:focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
