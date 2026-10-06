import { readFile, writeFile } from "node:fs/promises";
import { splitSql } from "./sales-migration-plan";
async function main() {
  await writeFile(
    "drizzle-current/0004_care_menu_commands.sql",
    splitSql(await readFile("database/care-menu-functions.sql", "utf8")).join(
      "\n--> statement-breakpoint\n",
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
