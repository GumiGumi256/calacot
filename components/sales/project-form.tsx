"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveProject, getPickers } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { FieldSet, FieldLegend, FieldDescription, FieldSeparator } from "@/components/ui/field";
import { TextField, ChoiceField } from "./form-controls";
import { divisions, currencies } from "@/lib/sales/contracts";
import { cn } from "@/lib/utils";

const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export function ProjectForm({
  clients,
  owners,
  clientId = "",
  onCreated,
  stickyActions = false,
}: {
  clients: Record<string, unknown>[];
  owners: Record<string, unknown>[];
  clientId?: string;
  onCreated?: (id: string) => void;
  /** Pin the submit bar to the bottom of a scrolling container (e.g. a sheet). */
  stickyActions?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState(clients);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({
    clientId,
    name: "",
    division: "architecture",
    currency: "UGX",
    scope: "",
    managerId: "",
    startsOn: "",
    dueOn: "",
  });
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      setSearching(true);
      void getPickers(undefined, search)
        .then((r) => {
          if (active) setOptions(r.clients);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [search]);
  const update = (key: keyof typeof form, value: string) => {
    setMessage("");
    setForm((f) => ({ ...f, [key]: value }));
  };

  function validate() {
    if (!form.clientId) return "Choose a client for this project.";
    if (!form.name.trim()) return "Enter a project title.";
    if (form.startsOn && form.dueOn && form.dueOn < form.startsOn)
      return "The due date can't be before the start date.";
    return "";
  }

  const clientOptions = options.map((c) => ({ value: String(c.id), label: String(c.name) }));

  return (
    <form
      className="@container flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const problem = validate();
        if (problem) {
          setMessage(problem);
          return;
        }
        start(async () => {
          const r = await saveProject(form);
          if (r.ok) {
            if (onCreated) onCreated(r.value);
            else {
              router.push(`/admin/projects/${r.value}`);
              router.refresh();
            }
          } else setMessage(r.error);
        });
      }}
    >
      {!clientId && (
        <>
          <FieldSet>
            <FieldLegend>Client</FieldLegend>
            <FieldDescription>Who is this project for?</FieldDescription>
            <div className="grid gap-5 @xl:grid-cols-2">
              <TextField
                label="Find a client"
                value={search}
                onChange={setSearch}
                type="search"
                placeholder="Search by name, email or phone"
                hint={searching ? "Searching…" : `${clientOptions.length} client${clientOptions.length === 1 ? "" : "s"} available`}
              />
              <ChoiceField
                label="Client *"
                value={form.clientId}
                onChange={(v) => update("clientId", v)}
                options={clientOptions}
                placeholder={clientOptions.length ? "Select a client" : "No matching clients"}
              />
            </div>
          </FieldSet>
          <FieldSeparator />
        </>
      )}

      <FieldSet>
        <FieldLegend>Project details</FieldLegend>
        <div className="grid gap-5 @xl:grid-cols-2">
          <div className="@xl:col-span-2">
            <TextField
              label="Project title *"
              value={form.name}
              onChange={(v) => update("name", v)}
              placeholder="e.g. Kololo residence – concept design"
              required
            />
          </div>
          <ChoiceField
            label="Division"
            value={form.division}
            onChange={(v) => update("division", v)}
            options={divisions.map((value) => ({ value, label: titleCase(value) }))}
          />
          <ChoiceField
            label="Currency"
            value={form.currency}
            onChange={(v) => update("currency", v)}
            options={currencies.map((value) => ({ value, label: value }))}
          />
          <div className="@xl:col-span-2">
            <ChoiceField
              label="Project owner"
              value={form.managerId}
              onChange={(v) => update("managerId", v)}
              options={owners.map((o) => ({ value: String(o.id), label: String(o.name) }))}
              placeholder="Unassigned"
              hint="Staff member accountable for delivery. Can be set later."
            />
          </div>
          <div className="@xl:col-span-2">
            <TextField
              label="Brief / scope"
              value={form.scope}
              onChange={(v) => update("scope", v)}
              multiline
              placeholder="What the client wants, key deliverables, constraints…"
            />
          </div>
        </div>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Schedule</FieldLegend>
        <FieldDescription>Optional. Leave blank if dates aren&apos;t agreed yet.</FieldDescription>
        <div className="grid gap-5 @xl:grid-cols-2">
          <TextField
            label="Start date"
            type="date"
            value={form.startsOn}
            onChange={(v) => update("startsOn", v)}
            max={form.dueOn || undefined}
          />
          <TextField
            label="Due date"
            type="date"
            value={form.dueOn}
            onChange={(v) => update("dueOn", v)}
            min={form.startsOn || undefined}
          />
        </div>
      </FieldSet>

      <div
        className={cn(
          "flex flex-col-reverse gap-3 @md:flex-row @md:items-center @md:justify-between",
          stickyActions && "sticky bottom-0 -mx-6 border-t bg-background px-6 py-4",
        )}
      >
        <p role="alert" aria-live="assertive" className="text-sm text-destructive">
          {message}
        </p>
        <Button type="submit" disabled={pending} className="@md:min-w-48">
          {pending ? "Creating…" : "Create planned project"}
        </Button>
      </div>
    </form>
  );
}
