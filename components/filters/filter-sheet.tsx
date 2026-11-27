"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ListFilterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

/** "Filters" trigger with an active-count badge. Shared by the GET-form sheet and the table toolbar sheet. */
export function FilterTriggerLabel({ activeCount }: { activeCount: number }) {
  return (
    <>
      <ListFilterIcon aria-hidden />
      Filters
      {activeCount > 0 && (
        <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 text-primary-foreground tabular-nums">
          {activeCount}
          <span className="sr-only"> active</span>
        </span>
      )}
    </>
  );
}

/**
 * Bottom sheet chrome for phone filters: swipe handle, title with close, a scrolling body and a sticky footer
 * with the primary action at the inline end (design system: dialogs and sheets).
 */
export function FilterSheetFrame({
  title,
  description,
  children,
  footer,
  form,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  /** Renders body and footer inside a GET form. It must live inside the portalled popup to own its fields. */
  form?: { action?: string; label: string };
}) {
  const body = (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-1 pb-5">
        {children}
      </div>
      <div className="flex shrink-0 gap-2 border-t bg-inherit px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {footer}
      </div>
    </>
  );
  return (
    <DrawerContent className="admin:bg-card">
      <DrawerHeader className="flex-row items-start justify-between gap-3 px-5 pt-2 pb-3 text-left">
        <div className="flex min-w-0 flex-col gap-0.5">
          <DrawerTitle className="text-left">{title}</DrawerTitle>
          {description && (
            <DrawerDescription className="text-left">
              {description}
            </DrawerDescription>
          )}
        </div>
        <DrawerClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close filters"
              className="-mr-2 shrink-0"
            />
          }
        >
          <XIcon aria-hidden />
        </DrawerClose>
      </DrawerHeader>
      {form ? (
        <form
          method="get"
          action={form.action}
          aria-label={form.label}
          className="flex min-h-0 flex-1 flex-col"
        >
          {body}
        </form>
      ) : (
        body
      )}
    </DrawerContent>
  );
}

/**
 * Phone filters for server-rendered GET forms. The fields are only mounted while the sheet is open, so their
 * names never clash with the desktop form; `hidden` carries values (such as the current search) that live
 * outside the sheet so applying filters does not drop them. Applying submits the form, which navigates and closes.
 */
export function FilterSheet({
  title = "Filters",
  description,
  activeCount,
  resetHref,
  hidden,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  activeCount: number;
  resetHref: string;
  hidden?: Record<string, string | undefined>;
  action?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer showSwipeHandle>
      <DrawerTrigger
        render={
          <Button type="button" variant="outline" className={className} />
        }
      >
        <FilterTriggerLabel activeCount={activeCount} />
      </DrawerTrigger>
      <FilterSheetFrame
        title={title}
        description={description}
        form={{ action, label: title }}
        footer={
          <>
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              nativeButton={false}
              render={<Link href={resetHref} />}
            >
              Reset
            </Button>
            <Button type="submit" size="lg" className="flex-1">
              Show results
            </Button>
          </>
        }
      >
        {Object.entries(hidden ?? {})
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        {children}
      </FilterSheetFrame>
    </Drawer>
  );
}
