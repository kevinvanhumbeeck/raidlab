"use client";

import Link from "next/link";
import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import { RoleCount } from "@/components/role-count";
import { SpecIcon } from "@/components/spec-icon";
import { coverageSummary, roleCoverage, type RoleOption } from "@/lib/coverage";
import { useDismiss } from "@/lib/use-dismiss";
import {
  ROLES,
  ROLE_LABELS,
  SIGNUP_STATUSES,
  STATUS_DOT,
  STATUS_LABELS,
  type Role,
  type RoleRequirements,
  playerHref,
  type SignupStatus,
} from "@/lib/wow";
import { setSignupStatus, withdraw } from "../actions";

export type SignupRow = {
  characterId: string;
  playerSlug: string;
  name: string;
  player: string | null;
  color: string;
  specId: string;
  specName: string;
  role: Role;
  options: RoleOption[];
  status: SignupStatus;
  note: string | null;
  isMine: boolean;
};

type Change = { characterId: string; status: SignupStatus | null };

const ROLE_ORDER: Record<Role, number> = { tank: 0, healer: 1, dps: 2 };
const byRoleThenName = (a: SignupRow, b: SignupRow) =>
  ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name);

export function SignupBoard({
  raidId,
  size,
  rows: serverRows,
  requirements,
  canEdit,
}: {
  raidId: string;
  size: number;
  rows: SignupRow[];
  requirements: RoleRequirements | null;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, applyChange] = useOptimistic(serverRows, (state, change: Change) =>
    change.status === null
      ? state.filter((r) => r.characterId !== change.characterId)
      : state.map((r) => (r.characterId === change.characterId ? { ...r, status: change.status! } : r)),
  );

  function change(characterId: string, status: SignupStatus | null) {
    setError(null);
    startTransition(async () => {
      applyChange({ characterId, status });
      try {
        await (status ? setSignupStatus(raidId, characterId, status) : withdraw(raidId, characterId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  const accepted = rows.filter((r) => r.status === "accepted");
  const coverage = roleCoverage(
    accepted.map((r) => ({ id: r.characterId, name: r.name, role: r.role, options: r.options })),
    requirements,
  );
  const summary = coverageSummary(coverage);
  const declined = rows.filter((r) => r.status === "declined").sort(byRoleThenName);

  if (!rows.length) return <p className="opacity-70">No sign-ups yet.</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <section className="rounded-xl border border-border bg-panel">
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-t-xl border-b border-border bg-panel-raised px-4 py-3">
          <h2 className="flex items-center gap-2 font-sans text-lg font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT.accepted}`} />
            Accepted
            <span className="tabular-nums opacity-70">
              {accepted.length}/{size}
            </span>
          </h2>
          {summary && <p className="text-sm text-amber-400">{summary}.</p>}
        </header>
        <div className="grid divide-border sm:grid-cols-[1fr_1fr_2fr] sm:divide-x">
          {ROLES.map((role) => {
            const inRole = accepted.filter((r) => r.role === role).sort(byRoleThenName);
            return (
              <div key={role} className="px-3 py-3">
                <h3 className="mb-2 flex items-baseline justify-between px-1 font-sans text-xs font-semibold uppercase tracking-wide">
                  <span className="opacity-60">{ROLE_LABELS[role]}</span>
                  <RoleCount
                    count={inRole.length}
                    needed={requirements?.[role]}
                    state={coverage.states[role]}
                    hint={coverage.states[role] === "offspec" ? summary : undefined}
                  />
                </h3>
                {/* DPS is most of the raid, so it gets two columns. */}
                <ul
                  className={`space-y-0.5 ${role === "dps" ? "lg:columns-2 lg:gap-4 [&>li]:break-inside-avoid" : ""}`}
                >
                  {inRole.map((r) => (
                    <PlayerRow key={r.characterId} row={r} canEdit={canEdit} onChange={change} />
                  ))}
                  {!inRole.length && <li className="px-1 text-sm opacity-40">—</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {declined.length > 0 && (
        <section className="rounded-xl border border-border bg-panel">
          <h2 className="flex items-center gap-2 rounded-t-xl border-b border-border bg-panel-raised px-4 py-2.5 font-sans font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT.declined}`} />
            {STATUS_LABELS.declined}
            <span className="tabular-nums opacity-70">{declined.length}</span>
          </h2>
          <ul className="grid gap-x-4 gap-y-0.5 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            {declined.map((r) => (
              <PlayerRow key={r.characterId} row={r} canEdit={canEdit} onChange={change} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlayerRow({
  row: r,
  canEdit,
  onChange,
}: {
  row: SignupRow;
  canEdit: boolean;
  onChange: (characterId: string, status: SignupStatus | null) => void;
}) {
  return (
    <li
      className={`group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-white/5 ${
        r.isMine ? "bg-accent/10" : ""
      }`}
    >
      <SpecIcon specId={r.specId} name={r.specName} />
      <Link
        href={playerHref(r.playerSlug, r.name)}
        className="truncate font-medium hover:underline"
        style={{ color: r.color }}
        title={r.player ?? undefined}
      >
        {r.name}
      </Link>
      {r.note && (
        <span className="cursor-help text-xs opacity-60" title={r.note}>
          ✎
        </span>
      )}
      {canEdit && (
        <StatusMenu current={r.status} name={r.name} onSelect={(status) => onChange(r.characterId, status)} />
      )}
    </li>
  );
}

function StatusMenu({
  current,
  name,
  onSelect,
}: {
  current: SignupStatus;
  name: string;
  onSelect: (status: SignupStatus | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  function pick(status: SignupStatus | null) {
    setOpen(false);
    onSelect(status);
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        aria-label={`Change status of ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded px-1.5 leading-5 opacity-50 hover:bg-white/10 hover:opacity-100 group-hover:opacity-100 ${
          open ? "bg-white/10 opacity-100" : ""
        }`}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-panel py-1 text-sm shadow-xl"
        >
          <p className="px-3 pb-1 pt-0.5 text-xs opacity-50">Move to</p>
          {SIGNUP_STATUSES.filter((s) => s !== current).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => pick(s)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABELS[s]}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(null)}
            className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-white/5"
          >
            Remove sign-up
          </button>
        </div>
      )}
    </div>
  );
}
