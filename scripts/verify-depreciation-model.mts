// Phase 2D: the pure straight-line model (lib/assets/depreciation.ts), which mirrors the SQL function.
import assert from "node:assert/strict";
import { straightLineDepreciation } from "../lib/assets/depreciation";

const base = { cost: "3600000.00", residual: "0.00", usefulLifeMonths: 36, depreciationStart: "2025-01-16", accumulated: "0.00" };
assert.equal(straightLineDepreciation({ ...base, convention: "daily_proration" }, "2025-01-01", "2025-01-31"), "51612.90", "16 of 31 days");
assert.equal(straightLineDepreciation({ ...base, convention: "full_month_from_capitalization" }, "2025-01-16", "2025-01-31"), "100000.00", "a whole first month");
assert.equal(straightLineDepreciation({ ...base, convention: "next_month_after_capitalization" }, "2025-01-16", "2025-01-31"), "0.00", "nothing in the first month");
assert.equal(straightLineDepreciation({ ...base, convention: "next_month_after_capitalization" }, "2025-02-01", "2025-02-28"), "100000.00");
assert.equal(straightLineDepreciation({ ...base, convention: "daily_proration" }, "2025-01-01", "2025-12-31"), "1151612.90", "catch-up across months");
assert.equal(straightLineDepreciation({ ...base, convention: "daily_proration", accumulated: "3550000.00" }, "2025-01-01", "2025-12-31"), "50000.00", "never beyond what remains");
assert.equal(straightLineDepreciation({ ...base, residual: "600000.00", convention: "full_month_from_capitalization" }, "2025-02-01", "2025-02-28"), "83333.33", "residual value excluded");
assert.equal(straightLineDepreciation({ ...base, convention: "daily_proration" }, "2024-12-01", "2024-12-31"), "0.00", "before depreciation starts");
console.log("Depreciation model checks passed.");
