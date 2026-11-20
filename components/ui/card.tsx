import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Design System V1 (admin only, via the admin: variant): soft, large-radius surfaces
 * (--card-radius, 28px; 20px for size="sm"), a hairline edge and a wide diffused shadow replace
 * the 10% ring. Padding grows to 24px from 640px up. Variants express function, not decoration.
 *   default      floating card surface
 *   flat         nested panel or row: tinted, no edge or shadow, smaller radius
 *   interactive  whole card is a link; lifts on hover
 *   attention    same surface as default; tone (warning/destructive) is exposed as data-tone
 *                for the content's icon and badges rather than tinting the whole card
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
        "admin:rounded-(--card-radius) admin:border admin:border-card-edge admin:shadow-card admin:ring-0 admin:data-[size=sm]:rounded-(--card-radius-sm) admin:data-[size=default]:sm:[--card-spacing:--spacing(6)]",
        "admin:data-[variant=flat]:rounded-(--card-radius-sm) admin:data-[variant=flat]:border-transparent admin:data-[variant=flat]:bg-card-nested admin:data-[variant=flat]:shadow-none",
        "admin:data-[variant=interactive]:transition-[box-shadow,translate] admin:data-[variant=interactive]:duration-200 admin:data-[variant=interactive]:hover:-translate-y-0.5 admin:data-[variant=interactive]:hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        // attention keeps the plain card surface; the tone shows in the card's own icon and badges.
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
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing) admin:rounded-b-none admin:border-card-edge admin:bg-transparent",
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
