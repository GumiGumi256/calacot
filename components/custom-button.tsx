import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const buttonVariants = cva(
  // Base styles - all pill-shaped with rounded-full
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary - Premium orange
        default:
          "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 active:scale-[0.98]",
        
        // Secondary - Deep teal
        secondary:
          "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20 hover:shadow-xl hover:shadow-secondary/30 hover:bg-secondary/90 active:scale-[0.98]",
        
        // Outline - With border
        outline:
          "border-2 border-primary text-primary bg-transparent hover:bg-primary/10 hover:border-primary/80 active:scale-[0.98]",
        
        // Ghost - Minimal
        ghost:
          "text-foreground hover:bg-primary/10 hover:text-primary active:scale-[0.98]",
        
        // Destructive - For dangerous actions
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]",
        
        // Premium gradient - Special occasions
        gradient:
          "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]",
        
        // Glass - Premium translucent effect
        glass:
          "glass-premium text-foreground hover:bg-white/20 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
      fullWidth: {
        true: "w-full",
      },
      loading: {
        true: "cursor-wait",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
      loading: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  loading?: boolean;
  loadingText?: string;
}

const CustomButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading = false,
      loadingText,
      icon,
      iconPosition = "left",
      children,
      disabled,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    // Render icon based on loading state
    const renderIcon = () => {
      if (loading) {
        return <Loader2 className="animate-spin" />;
      }
      if (icon) {
        return icon;
      }
      return null;
    };

const content = (
  <>
    {iconPosition === "left" && renderIcon()}
    {loading ? (loadingText || children) : children}
    {iconPosition === "right" && !loading && icon}
    {iconPosition === "right" && loading && renderIcon()}
  </>
);

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, loading, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-label={loading ? "Loading..." : props["aria-label"]}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);

CustomButton.displayName = "Button";

export { CustomButton, buttonVariants };