import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({path:[".env.local",".env"],quiet:true});
const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!url)throw new Error("Application database connection missing");
export default defineConfig({
  schema:["./database/schema/index.ts","./database/customer-care-schema.ts"],
  out:"./drizzle-current",
  dialect:"postgresql",
  dbCredentials:{url},
});
