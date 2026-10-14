"use client";

import { useState } from "react";
import { SpecPicker } from "@/components/spec-picker";
import { STATUS_LABELS, SIGNUP_STATUSES, type SignupStatus } from "@/lib/wow";

type Character = { id: string; name: string; specs: { id: string; name: string }[] };

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function SignupForm({
  action,
  withdrawAction,
  characters,
  current,
}: {
  action: (formData: FormData) => Promise<void>;
  withdrawAction?: () => Promise<void>;
  characters: Character[];
  current?: { characterId: string; specId: string | null; status: SignupStatus; note: string | null };
}) {
  const [characterId, setCharacterId] = useState(current?.characterId ?? characters[0]?.id);
  const character = characters.find((c) => c.id === characterId);

  return (
    <form action={action} className="grid gap-4 rounded-xl border border-border bg-panel p-4 sm:grid-cols-3">
      <label className="space-y-1">
        <span className="text-sm">Character</span>
        <select
          name="character_id"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className={input}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Status</span>
        <select name="status" defaultValue={current?.status ?? "accepted"} className={input}>
          {SIGNUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Note</span>
        <input name="note" defaultValue={current?.note ?? ""} placeholder="Late 15 min" className={input} />
      </label>
      <fieldset className="space-y-1.5 sm:col-span-3">
        <legend className="text-sm">Spec</legend>
        <SpecPicker
          key={characterId}
          name="spec_id"
          type="radio"
          required
          specs={character?.specs ?? []}
          defaultValues={[
            current?.characterId === characterId && current.specId ? current.specId : (character?.specs[0]?.id ?? ""),
          ]}
        />
      </fieldset>
      <div className="flex flex-wrap gap-3 sm:col-span-3">
        <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          {current ? "Update sign-up" : "Sign up"}
        </button>
        {withdrawAction && (
          <button
            formAction={withdrawAction}
            formNoValidate
            className="rounded bg-red-400 px-3 py-1.5 text-sm font-medium text-red-950 hover:bg-red-300"
          >
            Remove my sign-up
          </button>
        )}
      </div>
    </form>
  );
}
