"use client";

import { useActionState, useState } from "react";
import { saveCharacter, type CharacterFormState } from "./actions";

type ClassOption = { id: string; name: string; color: string };
type SpecOption = { id: string; class_id: string; name: string };

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function CharacterForm({
  classes,
  specs,
  character,
}: {
  classes: ClassOption[];
  specs: SpecOption[];
  // Present when editing an existing character.
  character?: { id: string; name: string; class_id: string; main_spec_id: string; off_spec_ids: string[]; is_main: boolean };
}) {
  const [state, action, pending] = useActionState<CharacterFormState, FormData>(saveCharacter, {
    error: null,
    saved: 0,
  });
  const [classId, setClassId] = useState(character?.class_id ?? classes[0]?.id);
  const [mainSpecId, setMainSpecId] = useState(character?.main_spec_id ?? "");
  const classSpecs = specs.filter((s) => s.class_id === classId);

  return (
    <form action={action} className="space-y-4 rounded border border-border bg-panel p-4">
      {character && <input type="hidden" name="id" value={character.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm">Name</span>
          <input name="name" required defaultValue={character?.name} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Class</span>
          <select
            name="class_id"
            value={classId}
            disabled={!!character}
            onChange={(e) => {
              setClassId(e.target.value);
              setMainSpecId("");
            }}
            className={`${input} disabled:opacity-60`}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm">Main spec</span>
          <select
            name="main_spec_id"
            required
            value={mainSpecId}
            onChange={(e) => setMainSpecId(e.target.value)}
            className={input}
          >
            <option value="" disabled>
              Choose…
            </option>
            {classSpecs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm">Off-specs you can also play</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {classSpecs
            .filter((s) => s.id !== mainSpecId)
            .map((s) => (
              <label key={`${classId}-${s.id}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="off_spec_ids"
                  value={s.id}
                  defaultChecked={character?.off_spec_ids.includes(s.id)}
                />
                {s.name}
              </label>
            ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_main" defaultChecked={character?.is_main ?? true} />
        Main character
      </label>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {character ? "Save changes" : "Add character"}
        </button>
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
        {!state.error && state.saved > 0 && <span className="text-sm text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}
