"use client";
import { useId, type ReactNode } from "react";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  required = false,
  hint,
  placeholder,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          maxLength={10000}
          placeholder={placeholder}
          aria-describedby={hintId}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          maxLength={1000}
          placeholder={placeholder}
          min={min}
          max={max}
          aria-describedby={hintId}
        />
      )}
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
export function ChoiceField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || null}
        onValueChange={(v) => onChange(v || "")}
        items={options}
      >
        <SelectTrigger id={id} className="w-full" aria-describedby={hintId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
export function FormMessage({ children }: { children: ReactNode }) {
  return children ? (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  ) : null;
}
