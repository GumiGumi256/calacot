"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveProject, getPickers } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
import { divisions, currencies } from "@/lib/sales/contracts";
export function ProjectForm({
  clients,
  owners,
  clientId = "",
  onCreated,
}: {
  clients: Record<string, unknown>[];
  owners: Record<string, unknown>[];
  clientId?: string;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState(clients);
  const [search, setSearch] = useState("");
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
      void getPickers(undefined, search).then((r) => {
        if (active) setOptions(r.clients);
      });
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [search]);
  const update = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
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
      <FieldGroup>
        {!clientId && (
          <>
            <TextField
              label="Search clients"
              value={search}
              onChange={setSearch}
            />
            <ChoiceField
              label="Client"
              value={form.clientId}
              onChange={(v) => update("clientId", v)}
              options={options.map((c) => ({
                value: String(c.id),
                label: String(c.name),
              }))}
            />
          </>
        )}
        <TextField
          label="Project title"
          value={form.name}
          onChange={(v) => update("name", v)}
          required
        />
        <ChoiceField
          label="Division"
          value={form.division}
          onChange={(v) => update("division", v)}
          options={divisions.map((value) => ({ value, label: value }))}
        />
        <ChoiceField
          label="Currency"
          value={form.currency}
          onChange={(v) => update("currency", v)}
          options={currencies.map((value) => ({ value, label: value }))}
        />
        <ChoiceField
          label="Owner"
          value={form.managerId}
          onChange={(v) => update("managerId", v)}
          options={owners.map((o) => ({
            value: String(o.id),
            label: String(o.name),
          }))}
        />
        <TextField
          label="Brief / scope"
          value={form.scope}
          onChange={(v) => update("scope", v)}
          multiline
        />
        <TextField
          label="Optional start date"
          type="date"
          value={form.startsOn}
          onChange={(v) => update("startsOn", v)}
        />
        <TextField
          label="Optional due date"
          type="date"
          value={form.dueOn}
          onChange={(v) => update("dueOn", v)}
        />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create planned project"}
        </Button>
      </FieldGroup>
    </form>
  );
}
