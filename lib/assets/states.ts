/** Asset states are derived from journals (lib/assets/reads.ts), never stored; this is the complete list. */
export const assetStates = ["draft", "capitalization_pending", "in_service", "fully_depreciated", "disposal_pending", "disposed", "hired"] as const;
