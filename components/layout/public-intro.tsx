import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The opening block of a public utility page (thank-you, privacy, sign-in, account): the same
 * eyebrow, heading and lead text the division pages use, so these pages read as one site.
 */
export function PublicIntro({
  eyebrow,
  title,
  description,
  id,
  align = "start",
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** id for aria-labelledby on the surrounding landmark. */
  id?: string;
  align?: "start" | "center";
  className?: string;
  children?: ReactNode;
}) {
  const center = align === "center";
  return (
    <header className={cn("flex flex-col", center && "items-center text-center", className)}>
      {eyebrow && <p className="type-eyebrow text-brand-black-600 dark:text-brand-black-200">{eyebrow}</p>}
      <h1 id={id} className={cn("section-heading mt-4 max-w-[20ch] text-brand-black dark:text-brand-white", center && "mx-auto")}>
        {title}
      </h1>
      {description && <p className={cn("section-copy mt-5 max-w-2xl", center && "mx-auto")}>{description}</p>}
      {children}
    </header>
  );
}
