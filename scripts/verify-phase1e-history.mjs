// Phase 1E: applies 0000-0010, inserts synthetic historical records, then applies 0011-0012
// and checks that existing data is preserved and still editable under the new rules.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const run = async (tags) => { for (const t of tags) for (const s of (await readFile(`drizzle-current/${t}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s); };
try {
  const tags = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")).entries.map((e) => e.tag);
  const split = tags.findIndex((t) => t.startsWith("0011"));
  await run(tags.slice(0, split));
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('h','Historic','Historic Ltd');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,clerk_role,status,division) VALUES
      ('00000000-0000-4000-8000-000000000001','h','user_old_admin','org:admin','active','architecture'),
      ('00000000-0000-4000-8000-000000000002','h','user_old_member','org:member','active',NULL),
      ('00000000-0000-4000-8000-000000000003','h','user_old_susp','org:sales','suspended','painting'),
      ('00000000-0000-4000-8000-000000000004','h','user_old_gone','org:finance','removed',NULL);
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000010','h','company','Old client','painting');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('00000000-0000-4000-8000-000000000011','h','00000000-0000-4000-8000-000000000010','OLD','Old painting job','painting','UGX');
    INSERT INTO expenses(id,organization_id,division,category,description,net_amount,total,currency,status,incurred_at) VALUES('00000000-0000-4000-8000-000000000012','h','painting','Paint','Legacy approved',100,100,'UGX','draft',now());`);
  await run(tags.slice(split));
  const staff = (await pg.query("SELECT clerk_user_id,status,employee_eligibility,profile_version,suspended_at FROM staff_memberships ORDER BY clerk_user_id")).rows;
  assert.equal(staff.length, 4, "no staff rows lost");
  assert(staff.every((s) => s.employee_eligibility === "pending" && s.profile_version === 1), "defaults applied without decisions");
  assert.equal(staff.find((s) => s.clerk_user_id === "user_old_susp").status, "suspended", "legacy suspension (no suspended_at) preserved and valid");
  // Disable painting, then confirm historical painting records stay usable.
  await pg.exec(`INSERT INTO company_settings_versions(organization_id,version,base_version,settings,changed_sections,status,note,proposed_by,decided_by,decided_at,idempotency_key)
    VALUES('h',1,0,'{"divisions":[{"key":"painting","enabled":false},{"key":"tech","enabled":true}]}','{divisions}','approved','Painting paused','user_old_admin','user_old_admin',now(),'k1')`);
  await pg.query("UPDATE projects SET name='Old painting job (renamed)' WHERE code='OLD'");
  await pg.query("UPDATE expenses SET description='Legacy edited' WHERE id='00000000-0000-4000-8000-000000000012'");
  await pg.query("UPDATE staff_memberships SET responsibilities='Legacy note' WHERE clerk_user_id='user_old_susp'");
  await assert.rejects(pg.query("UPDATE staff_memberships SET division='painting' WHERE clerk_user_id='user_old_admin'"), /division_disabled/);
  assert.equal((await pg.query("SELECT division FROM projects WHERE code='OLD'")).rows[0].division, "painting");
  console.log("PASS: 0011-0012 over synthetic historical staff, projects and expenses: rows preserved, safe defaults, legacy suspension valid, historical disabled-division records still editable.");
} finally { await pg.close(); }
