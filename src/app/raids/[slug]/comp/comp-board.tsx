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
import { moveToSlot, removeFromComp, setDuty, setSlotRole } from "./actions";
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
};

type Placement = Record<string, string>; // "group-position" -> character id

const ROLE_ORDER: Record<Role, number> = { tank: 0, healer: 1, dps: 2 };

export function CompBoard({
  raidId,
  size,
  characters,
  placement: serverPlacement,
  slotRoles: serverSlotRoles,
  requirements,
  duties,
  canEdit,
}: {
  raidId: string;
  size: number;
  characters: Record<string, BoardCharacter>;
  placement: Placement;
  // Role picked by an officer for placed hybrids (character id -> role).
  slotRoles: Record<string, Role>;
  requirements: RoleRequirements | null;
  duties: Partial<Record<RaidDuty, string>>;
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

  const groups = size / 5;
  const slotOf = new Map(Object.entries(placement).map(([slot, id]) => [id, slot]));
  const roleOf = (c: BoardCharacter) =>
    slotOf.has(c.id) && slotRoles[c.id] && c.roles.includes(slotRoles[c.id]) ? slotRoles[c.id] : c.role;
  const placed = Object.values(placement)
    .map((id) => characters[id])
    .filter(Boolean)
    .map((c) => ({ ...c, role: roleOf(c) }));

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

    const [groupNo, position] = target.split("-").map(Number);
    run(() => moveToSlot(raidId, characterId, groupNo, position), before);
  }

  const pool = Object.values(characters)
    .filter((c) => !slotOf.has(c.id) && c.status === "accepted")
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {error && <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Summary placed={placed} size={size} requirements={requirements} duties={duties} />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: groups }, (_, g) => (
            <div key={g} className="rounded-xl border border-border bg-panel/90 p-3">
              <h3 className="mb-2 font-sans text-sm font-semibold opacity-80">Group {g + 1}</h3>
              <div className="space-y-1.5">
                {Array.from({ length: 5 }, (_, p) => {
                  const slot = `${g + 1}-${p + 1}`;
                  const ch = characters[placement[slot]];
                  return (
                    <Slot key={slot} id={slot} disabled={!canEdit}>
                      {ch && (
                        <Card
                          character={ch}
                          disabled={!canEdit}
                          role={roleOf(ch)}
                          onCycleRole={ch.roles.length > 1 ? () => cycleRole(ch) : undefined}
                        />
                      )}
                    </Slot>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Pool disabled={!canEdit}>
          {pool.length ? (
            <div className="space-y-1.5">
              {/* Signed up but not placed: that's the bench. */}
              <h3 className="font-sans text-sm font-semibold opacity-80">Bench ({pool.length})</h3>
              {pool.map((c) => (
                <Card key={c.id} character={c} disabled={!canEdit} />
              ))}
            </div>
          ) : (
            <p className="text-sm opacity-60">Everyone who signed up is placed.</p>
          )}
        </Pool>
      </div>

      <Duties
        raidId={raidId}
        duties={duties}
        placed={placed}
        canEdit={canEdit}
        onError={setError}
      />
    </DndContext>
  );
}

function Summary({
  placed,
  size,
  requirements,
  duties,
}: {
  placed: BoardCharacter[];
  size: number;
  requirements: RoleRequirements | null;
  duties: Partial<Record<RaidDuty, string>>;
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
    <section className="space-y-2 rounded-xl border border-border bg-panel/90 p-3">
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

function Slot({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-11 rounded border border-dashed ${isOver ? "border-accent bg-accent/10" : "border-border"}`}
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
}: {
  character: BoardCharacter;
  disabled: boolean;
  // Only for placed characters: the role they fill, and a handler when the spec can fill several.
  role?: Role;
  onCycleRole?: () => void;
}) {
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
      } ${isDragging ? "relative z-10 opacity-80 shadow-lg" : ""}`}
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
  duties,
  placed,
  canEdit,
  onError,
}: {
  raidId: string;
  duties: Partial<Record<RaidDuty, string>>;
  placed: BoardCharacter[];
  canEdit: boolean;
  onError: (message: string) => void;
}) {
  const [, startTransition] = useTransition();
  const sorted = [...placed].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-panel/90 p-3 sm:grid-cols-4">
      {RAID_DUTIES.map((duty) => (
        <label key={duty} className="space-y-1 text-sm">
          <span className="opacity-80">{DUTY_LABELS[duty]}</span>
          <select
            value={duties[duty] ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              startTransition(async () => {
                try {
                  await setDuty(raidId, duty, e.target.value || null);
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
