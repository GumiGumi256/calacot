"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRangeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TIME_ZONE, formatDate } from "@/lib/format";

/** Today's calendar date in Kampala as YYYY-MM-DD. */
function kampalaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function rangePresets(today = kampalaToday()) {
  const [y, m] = today.split("-").map(Number);
  return [
    { id: "month", label: "This month", from: iso(y, m - 1, 1), to: today },
    { id: "3m", label: "Last 3 months", from: iso(y, m - 3, 1), to: today },
    { id: "year", label: "This year", from: iso(y, 0, 1), to: today },
  ];
}

/**
 * Period filter bound to the URL (`from` / `to`, Kampala calendar dates), matching the existing
 * financial-report filters so server reads stay the single source of truth.
 */
export function DateRangeFilter({ fromKey = "from", toKey = "to" }: { fromKey?: string; toKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const from = params.get(fromKey) ?? "";
  const to = params.get(toKey) ?? "";
  const [draft, setDraft] = useState({ from, to });
  const presets = rangePresets();
  const active = presets.find((p) => p.from === from && p.to === to);

  const apply = (next: { from: string; to: string }) => {
    const p = new URLSearchParams(params.toString());
    for (const [key, value] of [[fromKey, next.from], [toKey, next.to]] as const) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    p.delete("page");
    setOpen(false);
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  const summary = active ? active.label : from || to ? `${from ? formatDate(from) : "Start"} – ${to ? formatDate(to) : "Today"}` : "All dates";
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft({ from, to }); }}>
      <PopoverTrigger render={<Button variant="outline" size="sm" loading={pending} />}>
        {!pending && <CalendarRangeIcon />}
        {summary}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preset periods">
          {presets.map((p) => (
            <Button key={p.id} size="sm" variant={active?.id === p.id ? "soft" : "outline"} aria-pressed={active?.id === p.id} onClick={() => apply(p)}>
              {p.label}
            </Button>
          ))}
        </div>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="range-to">Through</Label>
            <Input id="range-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => apply({ from: "", to: "" })}>Clear</Button>
            <Button type="submit" size="sm">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
