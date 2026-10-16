"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { RoleCount, type RoleCountState } from "@/components/role-count";
import { SpecIcon } from "@/components/spec-icon";
import { autoFill, type FillResult } from "@/lib/auto-fill";
import { coverageSummary, roleCoverage, type RoleOption } from "@/lib/coverage";
import { createClient } from "@/lib/supabase/client";
import {
  DUTY_LABELS,
  FIXED_ROLES,
  RAID_DUTIES,
  ROLES,
  ROLE_LABELS,
  STATUS_LABELS,
  type RaidDuty,
  type Role,
  type RoleRequirements,
  type SignupStatus,
  rolesText,
} from "@/lib/wow";
import { applyAutoFill, clearComp, moveToSlot, removeFromComp, setDuty, setSlotRole } from "./actions";
import { readable } from "@/lib/theme";

export type BoardCharacter = {
  id: string;
  name: string;
  player: string;
  color: string;
  className: string;
  classId: string;
  specId: string;
  specName: string;
  // Primary role of the spec, and every role the spec can fill.
  role: Role;
  roles: Role[];
  // Every role the character can fill, offspecs included, for the minimums check.
  options: RoleOption[];
  status: SignupStatus | null;
  note: string | null;
  // Title of another raid around the same time where this player is already placed.
  elsewhere: string | null;
  // The split this character usually raids in for the instance (standing roster, #60).
  rosterSplit: number | null;
  // For auto-fill (#55): mains before alts, and the player's attendance percentage (officers only).
  isMain: boolean;
  attendance: number | null;
};

type Placement = Record<string, string>; // "split-group-position" -> character id
type Duties = Partial<Record<RaidDuty, string>>;

const ROLE_ORDER: Record<Role, number> = { tank: 0, healer: 1, dps: 2 };

export function CompBoard({
  raidId,
  size,
  splits,
  characters,
  placement: serverPlacement,
  slotRoles: serverSlotRoles,
  requirements,
  duties: serverDuties,
  canEdit,
}: {
  raidId: string;
  // Size of one split; a normal raid is one split.
  size: number;
  splits: number;
  characters: Record<string, BoardCharacter>;
  placement: Placement;
  // Role picked by an officer for placed hybrids (character id -> role).
  slotRoles: Record<string, Role>;
  // Per split.
  requirements: RoleRequirements | null;
  duties: Record<number, Duties>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Local copy for instant feedback; reset whenever the server sends new data.
  const [placement, setPlacement] = useState(serverPlacement);
  const [lastServerPlacement, setLastServerPlacement] = useState(serverPlacement);
  if (serverPlacement !== lastServerPlacement) {
    setLastServerPlacement(serverPlacement);
    setPlacement(serverPlacement);
  }
  const [slotRoles, setSlotRoles] = useState(serverSlotRoles);
  const [lastServerSlotRoles, setLastServerSlotRoles] = useState(serverSlotRoles);
  if (serverSlotRoles !== lastServerSlotRoles) {
    setLastServerSlotRoles(serverSlotRoles);
    setSlotRoles(serverSlotRoles);
  }

  // Refresh when another officer edits a comp or someone changes their sign-up.
  // Unfiltered on purpose: Realtime can't filter DELETE events by column.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comp-${raidId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comp_slots" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raidId, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // An auto-fill draft (#55) shows on the board, on top of the comp, until it's accepted or discarded. Nothing can
  // be dragged meanwhile.
  const [draft, setDraft] = useState<FillResult | null>(null);
  const draftByCharacter = new Map(draft?.slots.map((s) => [s.characterId, s]));
  const shown: Placement = { ...placement };
  for (const s of draft?.slots ?? []) shown[`${s.splitNo}-${s.groupNo}-${s.position}`] = s.characterId;
  const editable = canEdit && !draft;
  // A drafted character in the spec and role auto-fill picked.
  const asDrafted = (c: BoardCharacter): BoardCharacter => {
    const d = draftByCharacter.get(c.id);
    if (!d) return c;
    const option = c.options.find((o) => o.specId === d.specId && o.role === d.role);
    return { ...c, specId: d.specId, specName: option?.specName ?? c.specName, role: d.role, roles: [d.role] };
  };

  const groups = size / 5;
  const slotOf = new Map(Object.entries(shown).map(([slot, id]) => [id, slot]));
  const roleOf = (c: BoardCharacter) =>
    draftByCharacter.get(c.id)?.role ??
    (slotOf.has(c.id) && slotRoles[c.id] && c.roles.includes(slotRoles[c.id]) ? slotRoles[c.id] : c.role);
  const placedIn = (split: number) =>
    Object.entries(shown)
      .filter(([slot]) => slot.startsWith(`${split}-`))
      .map(([, id]) => characters[id])
      .filter(Boolean)
      .map((c) => ({ ...asDrafted(c), role: roleOf(c) }));

  function run(action: () => Promise<void>, rollback: Placement) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setPlacement(rollback);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  // Switch a placed hybrid to its next role (e.g. Feral dps -> tank).
  function cycleRole(c: BoardCharacter) {
    const current = roleOf(c);
    const next = c.roles[(c.roles.indexOf(current) + 1) % c.roles.length];
    const before = slotRoles;
    setSlotRoles({ ...slotRoles, [c.id]: next });
    setError(null);
    startTransition(async () => {
      try {
        await setSlotRole(raidId, c.id, next === c.role ? null : next);
      } catch (e) {
        setSlotRoles(before);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const characterId = String(active.id);
    const from = slotOf.get(characterId);
    const target = String(over.id);
    const before = placement;

    if (target === "pool") {
      if (!from) return;
      const next = { ...placement };
      delete next[from];
      setPlacement(next);
      run(() => removeFromComp(raidId, characterId), before);
      return;
    }

    if (target === from) return;
    const occupant = placement[target];
    const next = { ...placement, [target]: characterId };
    if (from) delete next[from];
    if (occupant && from) next[from] = occupant;
    setPlacement(next);

    const [splitNo, groupNo, position] = target.split("-").map(Number);
    run(() => moveToSlot(raidId, characterId, splitNo, groupNo, position), before);
  }

  const pool = Object.values(characters)
    .filter((c) => !slotOf.has(c.id) && c.status === "accepted")
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  const split = splits > 1;

  function runAutoFill() {
    setError(null);
    const dutySplit = new Map<string, number>();
    for (const [no, d] of Object.entries(serverDuties)) {
      for (const id of Object.values(d)) if (id && !dutySplit.has(id)) dutySplit.set(id, Number(no));
    }
    const placed = Object.entries(placement).flatMap(([slot, id]) => {
      const c = characters[id];
      if (!c) return [];
      const [splitNo, groupNo, position] = slot.split("-").map(Number);
      return [{ splitNo, groupNo, position, role: roleOf(c) }];
    });
    setDraft(
      autoFill({
        size,
        splits,
        requirements,
        placed,
        candidates: pool.map((c) => ({
          id: c.id,
          name: c.name,
          isMain: c.isMain,
          attendance: c.attendance,
          rosterSplit: split ? c.rosterSplit : null,
          dutySplit: dutySplit.get(c.id) ?? null,
          options: c.options.map((o) => ({ role: o.role, specId: o.specId })),
        })),
      }),
    );
  }

  function acceptDraft() {
    if (!draft) return;
    const before = { placement, slotRoles, draft };
    setPlacement(shown);
    setSlotRoles({ ...slotRoles, ...Object.fromEntries(draft.slots.map((s) => [s.characterId, s.role])) });
    setDraft(null);
    setError(null);
    startTransition(async () => {
      try {
        await applyAutoFill(raidId, before.draft.slots);
      } catch (e) {
        setPlacement(before.placement);
        setSlotRoles(before.slotRoles);
        setDraft(before.draft);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  // Empty the comp, or one split. Duties stay.
  function clear(splitNo: number | null) {
    const label = splitNo && split ? `split ${splitNo}` : "the comp";
    if (!window.confirm(`Clear ${label}? Everyone goes back to the bench; duties stay.`)) return;
    const before = placement;
    setPlacement(
      splitNo ? Object.fromEntries(Object.entries(placement).filter(([slot]) => !slot.startsWith(`${splitNo}-`))) : {},
    );
    run(() => clearComp(raidId, splitNo), before);
  }

  const groupGrid = (splitNo: number) => (
    <div className={split ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className={split ? "" : "rounded-xl border border-border bg-panel/90 p-3"}>
          <h3 className="mb-2 font-sans text-sm font-semibold opacity-80">Group {g + 1}</h3>
          <div className="space-y-1.5">
            {Array.from({ length: 5 }, (_, p) => {
              const slot = `${splitNo}-${g + 1}-${p + 1}`;
              const ch = characters[shown[slot]];
              const drafted = !!ch && draftByCharacter.has(ch.id);
              return (
                <Slot key={slot} id={slot} disabled={!editable}>
                  {ch && (
                    <Card
                      character={asDrafted(ch)}
                      disabled={!editable}
                      role={roleOf(ch)}
                      onCycleRole={ch.roles.length > 1 && !drafted ? () => cycleRole(ch) : undefined}
                      splitNo={split ? splitNo : undefined}
                      drafted={drafted}
                    />
                  )}
                </Slot>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
  const duties = (splitNo: number) => (
    <Duties
      raidId={raidId}
      splitNo={splitNo}
      duties={serverDuties[splitNo] ?? {}}
      placed={placedIn(splitNo)}
      canEdit={editable}
      stacked={split}
      onError={setError}
    />
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {error && <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {canEdit && (
        <AutoFillBar
          draft={draft}
          characters={characters}
          hasPlaced={Object.keys(placement).length > 0}
          onRun={runAutoFill}
          onAccept={acceptDraft}
          onDiscard={() => setDraft(null)}
          onClear={() => clear(null)}
        />
      )}

      {!split && (
        <Summary placed={placedIn(1)} size={size} requirements={requirements} duties={serverDuties[1] ?? {}} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        {split ? (
          // Splits side by side, each with its own counts and duties.
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: splits }, (_, i) => (
              <section key={i} className="space-y-3 rounded-xl border border-border bg-panel/90 p-3">
                <h2 className="flex items-center justify-between font-sans text-lg font-semibold">
                  Split {i + 1}
                  {editable && placedIn(i + 1).length > 0 && (
                    <button
                      type="button"
                      onClick={() => clear(i + 1)}
                      className="rounded border border-border px-2 py-0.5 text-xs font-normal hover:bg-foreground/5"
                    >
                      Clear
                    </button>
                  )}
                </h2>
                <Summary
                  placed={placedIn(i + 1)}
                  size={size}
                  requirements={requirements}
                  duties={serverDuties[i + 1] ?? {}}
                  compact
                />
                {groupGrid(i + 1)}
                {duties(i + 1)}
              </section>
            ))}
          </div>
        ) : (
          groupGrid(1)
        )}

        <Pool disabled={!editable}>
          {pool.length ? (
            <div className="space-y-1.5">
              {/* Signed up but not placed: that's the bench. */}
              <h3 className="font-sans text-sm font-semibold opacity-80">Bench ({pool.length})</h3>
              {pool.map((c) => (
                <div key={c.id}>
                  <Card character={c} disabled={!editable} showRoster={split} />
                  {draft && (
                    <p className="px-2 pt-0.5 text-[11px] text-warn">
                      {draft.skipped.find((s) => s.characterId === c.id)?.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm opacity-60">Everyone who signed up is placed.</p>
          )}
        </Pool>
      </div>

      {!split && duties(1)}
    </DndContext>
  );
}

function Summary({
  placed,
  size,
  requirements,
  duties,
  compact = false,
}: {
  placed: BoardCharacter[];
  size: number;
  requirements: RoleRequirements | null;
  duties: Duties;
  // Inside a split's column, without a panel of its own.
  compact?: boolean;
}) {
  const count = (role: Role) => placed.filter((c) => c.role === role).length;
  const coverage = roleCoverage(placed, requirements);
  const summary = coverageSummary(coverage);
  // Tanks and healers should match the instance exactly (#27); officers can still go over or under.
  const off = (role: Role) => (requirements && FIXED_ROLES.includes(role) ? count(role) - requirements[role] : 0);
  const stateOf = (role: Role): RoleCountState | undefined =>
    !FIXED_ROLES.includes(role) ? undefined : off(role) > 0 ? "over" : coverage.states[role];
  const warnings = [
    ...FIXED_ROLES.filter((role) => off(role) < 0).map((role) => `${rolesText(-off(role), role)} short`),
    ...FIXED_ROLES.filter((role) => off(role) > 0).map((role) => `${rolesText(off(role), role)} too many`),
    summary,
    ...placed
      .filter((c) => c.status !== "accepted")
      .map((c) => `${c.name} is ${c.status ? STATUS_LABELS[c.status].toLowerCase() : "no longer signed up"}`),
    ...placed.filter((c) => c.elsewhere).map((c) => `${c.player} is also placed in ${c.elsewhere}`),
    !duties.raid_lead && "No raid lead assigned",
  ].filter(Boolean) as string[];

  const classCounts = new Map<string, { name: string; color: string; n: number }>();
  for (const c of placed) {
    const entry = classCounts.get(c.classId) ?? { name: c.className, color: c.color, n: 0 };
    entry.n++;
    classCounts.set(c.classId, entry);
  }

  return (
    <section className={compact ? "space-y-2" : "space-y-2 rounded-xl border border-border bg-panel/90 p-3"}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="text-base font-semibold">
          {placed.length}/{size} placed
        </span>
        {ROLES.map((role) => (
          <span key={role} className="flex items-baseline gap-1.5">
            {ROLE_LABELS[role]}
            <strong>
              <RoleCount
                count={count(role)}
                needed={requirements?.[role]}
                state={stateOf(role)}
                hint={coverage.states[role] === "offspec" ? summary : undefined}
              />
            </strong>
          </span>
        ))}
      </div>
      {classCounts.size > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {[...classCounts.values()].map((c) => (
            <span key={c.name} style={{ color: readable(c.color) }}>
              {c.name} {c.n}
            </span>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-warn">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AutoFillBar({
  draft,
  characters,
  hasPlaced,
  onRun,
  onAccept,
  onDiscard,
  onClear,
}: {
  draft: FillResult | null;
  characters: Record<string, BoardCharacter>;
  hasPlaced: boolean;
  onRun: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  onClear: () => void;
}) {
  const button = "rounded border border-border px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-40";
  if (!draft) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Auto-fill
        </button>
        <button type="button" onClick={onClear} disabled={!hasPlaced} className={button}>
          Clear
        </button>
        <span className="text-xs opacity-60">
          Auto-fill places accepted sign-ups in the empty spots: duties first, then tanks and healers, then DPS.
        </span>
      </div>
    );
  }
  const n = draft.slots.length;
  return (
    <section className="space-y-2 rounded-xl border border-accent/60 bg-accent/10 p-3 text-sm">
      <p>
        {n ? (
          <>
            Auto-fill would place <strong>{n}</strong> player{n === 1 ? "" : "s"} (outlined).
          </>
        ) : (
          "Nothing to place: there are no empty spots or nobody left on the bench."
        )}
        {draft.skipped.length > 0 &&
          ` ${draft.skipped.length} stay${draft.skipped.length === 1 ? "s" : ""} on the bench: ${draft.skipped
            .map((s) => characters[s.characterId]?.name)
            .join(", ")}.`}{" "}
        Nothing is saved until you accept.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={!n}
          className="rounded bg-accent px-3 py-1 font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          Accept
        </button>
        <button type="button" onClick={onDiscard} className={button}>
          Discard
        </button>
      </div>
    </section>
  );
}

function Slot({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    // Exactly one card tall (32px) plus the dashed border, so a filled slot has no gap and an empty one the same height.
    <div
      ref={setNodeRef}
      className={`min-h-[34px] rounded border border-dashed ${isOver ? "border-accent bg-accent/10" : "border-border"}`}
    >
      {children}
    </div>
  );
}

function Pool({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool", disabled });
  return (
    <aside
      ref={setNodeRef}
      className={`space-y-4 rounded border bg-panel/90 p-3 ${isOver ? "border-accent" : "border-border"}`}
    >
      {children}
    </aside>
  );
}

const ROLE_BADGE: Record<Role, string> = { tank: "Tank", healer: "Heal", dps: "DPS" };

function Card({
  character: c,
  disabled,
  role,
  onCycleRole,
  splitNo,
  showRoster = false,
  drafted = false,
}: {
  character: BoardCharacter;
  disabled: boolean;
  // Only for placed characters: the role they fill, and a handler when the spec can fill several.
  role?: Role;
  onCycleRole?: () => void;
  // The split a placed character is in, to flag exceptions to the standing roster.
  splitNo?: number;
  // On the bench of a split night: show the split the character usually raids in.
  showRoster?: boolean;
  // Placed by an auto-fill draft that isn't saved yet.
  drafted?: boolean;
}) {
  const rosterTag =
    c.rosterSplit && (showRoster || (splitNo !== undefined && splitNo !== c.rosterSplit)) ? c.rosterSplit : null;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded bg-background px-2 py-1.5 text-sm ${
        disabled ? "" : "cursor-grab touch-none"
      } ${isDragging ? "relative z-10 opacity-80 shadow-lg" : ""} ${drafted ? "ring-1 ring-accent" : ""}`}
      title={c.note ?? undefined}
    >
      <SpecIcon specId={c.specId} name={c.specName} />
      <span className="truncate font-medium" style={{ color: readable(c.color) }}>
        {c.name}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {role && c.status !== "accepted" && (
          <span className="text-xs text-warn">
            {c.status ? STATUS_LABELS[c.status].toLowerCase() : "not signed up"}
          </span>
        )}
        {rosterTag && (
          <span
            className="rounded border border-border px-1 text-[11px] leading-4 opacity-70"
            title={`Usually in split ${rosterTag}`}
          >
            S{rosterTag}
          </span>
        )}
        {c.elsewhere && (
          <span className="text-xs text-warn" title={`Also in ${c.elsewhere}`}>
            ⚠
          </span>
        )}
        {role && onCycleRole && (
          <button
            type="button"
            disabled={disabled}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={onCycleRole}
            title={disabled ? `Plays ${ROLE_BADGE[role].toLowerCase()}` : "Switch role"}
            className="rounded border border-border px-1.5 text-[11px] leading-4 opacity-80 enabled:hover:border-accent enabled:hover:opacity-100"
          >
            {ROLE_BADGE[role]}
          </button>
        )}
      </span>
    </div>
  );
}

function Duties({
  raidId,
  splitNo,
  duties,
  placed,
  canEdit,
  stacked,
  onError,
}: {
  raidId: string;
  splitNo: number;
  duties: Duties;
  placed: BoardCharacter[];
  canEdit: boolean;
  // One column, inside a split.
  stacked: boolean;
  onError: (message: string) => void;
}) {
  const [, startTransition] = useTransition();
  const sorted = [...placed].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section
      className={
        stacked ? "grid grid-cols-2 gap-3" : "grid gap-3 rounded-xl border border-border bg-panel/90 p-3 sm:grid-cols-4"
      }
    >
      {RAID_DUTIES.map((duty) => (
        <label key={duty} className="space-y-1 text-sm">
          <span className="opacity-80">{DUTY_LABELS[duty]}</span>
          <select
            value={duties[duty] ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              startTransition(async () => {
                try {
                  await setDuty(raidId, splitNo, duty, e.target.value || null);
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Could not save");
                }
              })
            }
            className="w-full rounded border border-border bg-background px-2 py-1.5"
          >
            <option value="">—</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}
