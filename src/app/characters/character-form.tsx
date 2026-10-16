"use client";

import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { SpecPicker } from "@/components/spec-picker";
import { deleteCharacter, saveCharacter, type CharacterFormState } from "./actions";

type ClassOption = { id: string; name: string; color: string };
type SpecOption = { id: string; class_id: string; name: string };

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function CharacterForm({
  classes,
  specs,
  character,
  currentMain,
}: {
  classes: ClassOption[];
  specs: SpecOption[];
  // The player's main, if they have one (and it isn't this character).
  currentMain?: string;
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
    <form action={action} className="space-y-4 rounded-xl border border-border bg-panel/90 p-4">
      {character && <input type="hidden" name="id" value={character.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm">Main spec</legend>
        <SpecPicker
          key={classId}
          name="main_spec_id"
          type="radio"
          required
          specs={classSpecs}
          defaultValues={mainSpecId ? [mainSpecId] : []}
          onChange={(specId) => setMainSpecId(specId)}
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm">Off-specs you can also play</legend>
        <SpecPicker
          key={`${classId}:${mainSpecId}`}
          name="off_spec_ids"
          type="checkbox"
          specs={classSpecs.filter((s) => s.id !== mainSpecId)}
          defaultValues={character?.off_spec_ids ?? []}
        />
      </fieldset>

      <label className="flex flex-wrap items-center gap-x-2 text-sm">
        <input type="checkbox" name="is_main" defaultChecked={character ? character.is_main : !currentMain} />
        Main character
        {currentMain && <span className="text-xs text-muted">(replaces {currentMain} as your main)</span>}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {character ? "Save changes" : "Add character"}
        </button>
        {character && (
          <ConfirmButton
            formAction={deleteCharacter}
            message={`Delete ${character.name}? This also removes their sign-ups and attendance.`}
            className="rounded bg-red-400 px-3 py-1.5 text-sm font-medium text-red-950 hover:bg-red-300"
          >
            Delete {character.name}
          </ConfirmButton>
        )}
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
        {!state.error && state.saved > 0 && <span className="text-sm text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}
