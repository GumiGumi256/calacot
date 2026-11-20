"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { adminBreadcrumbs } from "@/lib/admin/breadcrumbs";

/**
 * "You are here" for every admin page (docs C6). Desktop shows the full trail; phones show a
 * back link to the parent section plus the current page, so the header never overflows.
 */
export function AdminBreadcrumbs() {
  const crumbs = adminBreadcrumbs(usePathname());
  if (!crumbs.length) return null;
  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  return (
    <Breadcrumb className="min-w-0">
      {/* Phones */}
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        {parent && (
          <Link
            href={parent.href}
            className="-ml-1 flex size-8 shrink-0 pointer-coarse:size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Back to ${parent.label}`}
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
          </Link>
        )}
        <span aria-current="page" className="truncate type-body-strong">{current.label}</span>
      </div>
      {/* Tablet and desktop */}
      <BreadcrumbList className="hidden flex-nowrap md:flex">
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />} className="truncate">
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
