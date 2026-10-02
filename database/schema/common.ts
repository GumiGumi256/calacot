import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  numeric,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const divisions = [
  "estates",
  "architecture",
  "painting",
  "interiors",
  "tech",
] as const;
export const currencies = ["UGX", "USD"] as const;
export type Currency = (typeof currencies)[number];
export type Division = (typeof divisions)[number];

// Keep NUMERIC values as strings. Use decimal arithmetic in application services.
export const money = (name: string) =>
  numeric(name, { precision: 17, scale: 2 });
export const instant = (name: string) =>
  timestamp(name, { withTimezone: true });
export const timestamps = () => ({
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});

// Explicit CHECKs enforce statuses in Postgres; text({ enum }) only narrows TS types.
export function allowed(
  name: string,
  column: AnyPgColumn,
  values: readonly string[],
) {
  // DDL cannot contain bind parameters. These values come only from schema constants.
  const literals = values.map((value) =>
    sql.raw(`'${value.replace(/'/g, "''")}'`),
  );
  return check(name, sql`${column} in (${sql.join(literals, sql`, `)})`);
}

// Scope every new parent/child relationship to the same Clerk organization.
export function scopedForeignKey(
  name: string,
  organizationColumn: AnyPgColumn,
  localColumn: AnyPgColumn,
  parentOrganizationColumn: AnyPgColumn,
  parentIdColumn: AnyPgColumn,
) {
  return foreignKey({
    name,
    columns: [organizationColumn, localColumn],
    foreignColumns: [parentOrganizationColumn, parentIdColumn],
  }).onDelete("restrict");
}
