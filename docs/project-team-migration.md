# Project team migration deployment

On 21 November 2026, the production Neon `calacot` database (`shy-queen-47864466`, `neondb`) received the schema changes in `drizzle-current/0015_flimsy_magdalene.sql` in a single transaction. The `project_members` table had no existing rows at preflight. The new columns and nullable `staff_id` were verified after the transaction.

The production `drizzle.__drizzle_migrations` table contained only two legacy entries, and did not match the `drizzle-current` journal. The changes were therefore applied explicitly; the Drizzle ledger was not advanced, since doing so would incorrectly mark the intervening migrations as applied. Reconcile the production schema and migration history before using `drizzle-kit migrate` against this database; blindly running it can attempt to replay earlier migrations or this already-applied migration.
