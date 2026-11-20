import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Design System V1 (admin only, via the admin: variant): elevation replaces the 10% ring,
 * padding grows to 20px from 640px up, and variants express function rather than decoration.
 *   default      level 1 elevation
 *   flat         nested panel, no elevation
 *   interactive  whole card is a link; lifts on hover
 *   attention    level 2 with a warning (or destructive, via tone) inline-start bar
 * Outside the admin shell the card renders exactly as before.
 */
type CardVariant = "default" | "flat" | "interactive" | "attention"

function Card({
  className,
  size = "default",
  variant = "default",
  tone = "warning",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: CardVariant
  tone?: "warning" | "destructive"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      data-tone={variant === "attention" ? tone : undefined}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        "admin:border admin:border-border admin:shadow-e1 admin:ring-0 admin:data-[size=default]:sm:[--card-spacing:--spacing(5)]",
        "admin:data-[variant=flat]:bg-surface-subtle admin:data-[variant=flat]:shadow-none",
        "admin:data-[variant=interactive]:transition-shadow admin:data-[variant=interactive]:hover:shadow-e2 motion-reduce:transition-none",
        "admin:data-[variant=attention]:border-s-4 admin:data-[variant=attention]:shadow-e2 admin:data-[tone=warning]:border-s-warning admin:data-[tone=destructive]:border-s-destructive",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

/**
 * `as` sets the heading level without changing the look, e.g. as="h1" when this card's title is
 * the page title (one <h1> per page). Defaults to a <div>, as before.
 */
function CardTitle({
  className,
  as: Tag = "div",
  ...props
}: Omit<React.ComponentProps<"div">, "ref"> & { as?: "div" | "h1" | "h2" | "h3" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm admin:type-card-title",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground admin:type-description", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing) admin:bg-surface-subtle",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
