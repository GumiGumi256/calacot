import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { isValidElement } from "react";

import { cn } from "@/lib/utils";

/*
 * Geometry comes from CSS variables (app/globals.css). Public pages keep the original pill
 * buttons (44px default); inside [data-surface="admin"] the same sizes become denser 8px-radius
 * controls, and grow back to 44px on touch screens. Explicit className sizes still win.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--btn-radius) border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 motion-reduce:transition-none outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        outline: "border-border bg-background text-foreground shadow-xs hover:bg-accent aria-expanded:bg-accent admin:bg-card",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 aria-expanded:bg-secondary",
        soft: "bg-primary/15 text-foreground hover:bg-primary/25 aria-expanded:bg-primary/25 aria-pressed:bg-primary/30 dark:bg-primary/12 dark:hover:bg-primary/20",
        ghost: "text-foreground hover:bg-accent aria-expanded:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive",
        "destructive-ghost": "text-destructive hover:bg-destructive/10 focus-visible:ring-destructive",
        link: "text-foreground underline underline-offset-4 decoration-border hover:decoration-current",
        glass: "border-overlay-border bg-overlay text-overlay-foreground backdrop-blur-xl hover:bg-overlay-hover",
      },
      size: {
        default: "h-(--btn-h) gap-2 px-(--btn-px)",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--btn-h-sm) gap-1.5 px-(--btn-px-sm) text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--btn-h-lg) gap-2.5 px-(--btn-px-lg)",
        icon: "size-(--btn-h)",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-(--btn-h-sm)",
        "icon-lg": "size-(--btn-h-lg)",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
    },
  },
);

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, keeps the label, blocks repeat clicks and sets aria-busy. */
    loading?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  fullWidth,
  loading = false,
  disabled,
  children,
  render,
  nativeButton,
  ...props
}: ButtonProps) {
  // Rendered as a link (<Link>, <a>)? Then it is not a native button: Base UI must not add
  // role="button" to it, or screen readers announce a link as a button. Callers may still override.
  const rendersNonButton = isValidElement(render) && render.type !== "button";
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      render={render}
      nativeButton={nativeButton ?? !rendersNonButton}
      {...props}
    >
      {loading ? (
        <>
          <Loader2Icon aria-hidden className="animate-spin motion-reduce:animate-none" />
          {children}
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
