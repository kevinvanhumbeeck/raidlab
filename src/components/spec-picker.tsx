import { SpecIcon } from "@/components/spec-icon";

// Spec choices as icon + name buttons: radio for one spec, checkbox for several.
export function SpecPicker({
  name,
  type,
  specs,
  defaultValues = [],
  required,
  onChange,
}: {
  name: string;
  type: "radio" | "checkbox";
  specs: { id: string; name: string }[];
  defaultValues?: string[];
  required?: boolean;
  onChange?: (specId: string, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {specs.map((s) => (
        <label key={s.id} className="cursor-pointer">
          <input
            type={type}
            name={name}
            value={s.id}
            required={required}
            defaultChecked={defaultValues.includes(s.id)}
            onChange={(e) => onChange?.(s.id, e.target.checked)}
            className="peer sr-only"
          />
          <span className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm opacity-60 hover:opacity-100 peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            <SpecIcon specId={s.id} name={s.name} />
            {s.name}
          </span>
        </label>
      ))}
    </div>
  );
}
