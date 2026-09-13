import * as React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends
    React.ComponentProps<typeof Button>,
    VariantProps<typeof buttonVariants> {
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
      ...props
    },
    ref,
  ) => {
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
        {loading ? loadingText || children : children}
        {iconPosition === "right" && !loading && icon}
        {iconPosition === "right" && loading && renderIcon()}
      </>
    );

    return (
      <Button
        className={cn(
          className,
          loading && "cursor-wait",
        )}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        aria-busy={loading || undefined}
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-label={loading ? "Loading..." : props["aria-label"]}
        {...props}
      >
        {content}
      </Button>
    );
  },
);

CustomButton.displayName = "Button";

export { CustomButton, buttonVariants };
