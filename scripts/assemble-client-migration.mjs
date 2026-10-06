import { readFileSync, writeFileSync } from "node:fs";
const path = "drizzle/0011_client_departments.sql";
const ddl = readFileSync(path, "utf8").split("\n-- BEGIN CLIENT SERVICE")[0];
const services = readFileSync("database/sales-functions.sql", "utf8");
const start = services.indexOf("CREATE OR REPLACE FUNCTION sales_client(");
const end = services.indexOf("CREATE OR REPLACE FUNCTION sales_project(", start);
if (start < 0 || end < 0) throw new Error("Client service boundaries missing");
writeFileSync(path, ddl + "\n-- BEGIN CLIENT SERVICE\n--> statement-breakpoint\n" + services.slice(start, end));
