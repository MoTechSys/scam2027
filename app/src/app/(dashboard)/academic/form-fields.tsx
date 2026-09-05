"use client";

/**
 * Small form primitives shared by the academic dialogs and the setup wizard.
 * Every field is labelled, ≥44px tall, and surfaces server `fieldErrors` via role="alert".
 */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Option } from "@/features/academic/queries";
import type { FieldErrors } from "@/lib/result";

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name]?.[0];
  return msg ? (
    <p id={`${name}-error`} className="text-xs text-destructive" role="alert">
      {msg}
    </p>
  ) : null;
}

type Common = { id: string; name: string; label: string; errors: FieldErrors; optional?: boolean; hint?: string; className?: string };

export function TextField({ id, name, label, errors, optional, hint, className, ...input }: Common & Omit<React.ComponentProps<typeof Input>, "id" | "name">) {
  const tc = useTranslations("common");
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {label} {optional && <span className="text-muted-foreground">({tc("optional")})</span>}
      </Label>
      <Input id={id} name={name} className="min-h-11" aria-invalid={!!errors[name]} aria-describedby={`${hint ? `${id}-hint ` : ""}${name}-error`} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError errors={errors} name={name} />
    </div>
  );
}

export function TextAreaField({ id, name, label, errors, optional, className, ...ta }: Common & Omit<React.ComponentProps<typeof Textarea>, "id" | "name">) {
  const tc = useTranslations("common");
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {label} {optional && <span className="text-muted-foreground">({tc("optional")})</span>}
      </Label>
      <Textarea id={id} name={name} rows={2} aria-invalid={!!errors[name]} aria-describedby={`${name}-error`} {...ta} />
      <FieldError errors={errors} name={name} />
    </div>
  );
}

/** Date input bound to ISO `YYYY-MM-DD`. */
export function DateField(props: Common & { defaultValue?: Date | string | null; required?: boolean; value?: string; onChange?: React.ChangeEventHandler<HTMLInputElement> }) {
  const { defaultValue, value, onChange, ...rest } = props;
  // Controlled when `value` is given (wizard); otherwise uncontrolled with a normalised default (dialogs).
  if (value !== undefined) return <TextField {...rest} type="date" dir="ltr" value={value} onChange={onChange} />;
  const v = defaultValue instanceof Date ? defaultValue.toISOString().slice(0, 10) : (defaultValue ?? "");
  return <TextField {...rest} type="date" dir="ltr" defaultValue={v} />;
}

/**
 * Controlled select that writes to a hidden input so plain FormData submission keeps working.
 * `options` may carry `group` for grouped rendering.
 */
export function SelectField({
  id, name, label, errors, optional, className, value, onChange, options, placeholder, disabled,
}: Common & { value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean }) {
  const tc = useTranslations("common");
  const groups = new Map<string | undefined, Option[]>();
  for (const o of options) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {label} {optional && <span className="text-muted-foreground">({tc("optional")})</span>}
      </Label>
      <input type="hidden" name={name} value={value} />
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="min-h-11 w-full" aria-invalid={!!errors[name]} aria-describedby={`${name}-error`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {[...groups.entries()].map(([g, opts]) => (
            <SelectGroup key={g ?? "_"}>
              {g && <SelectLabel>{g}</SelectLabel>}
              {opts.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={errors} name={name} />
    </div>
  );
}

/** Checkbox that submits "on" via FormData when checked (read with `fd.get(name) === "on"`). */
export function CheckField({ id, name, label, defaultChecked, className }: { id: string; name: string; label: string; defaultChecked?: boolean; className?: string }) {
  return (
    <div className={`flex min-h-11 items-center gap-2 ${className ?? ""}`}>
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

export function FormFooter({ pending, onCancel, submitLabel }: { pending: boolean; onCancel: () => void; submitLabel?: string }) {
  const tc = useTranslations("common");
  return (
    <DialogFooter className="gap-2">
      <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
        {tc("cancel")}
      </Button>
      <Button type="submit" disabled={pending} className="min-h-11 gap-2">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {submitLabel ?? tc("save")}
      </Button>
    </DialogFooter>
  );
}

/** FormData → plain object; checkboxes → boolean; empty strings for optional dates → null. */
export function formValues(fd: FormData, opts: { bools?: string[]; nullable?: string[] } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  for (const b of opts.bools ?? []) out[b] = fd.get(b) === "on";
  for (const n of opts.nullable ?? []) if (!out[n]) out[n] = null;
  return out;
}
