"use client";

import { useState } from "react";
import { realmTimeToDate, realmToday } from "@/lib/wow";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const minutes = i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const DEFAULT_TIME = "20:00";

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Calendar and time picker in realm (server) time. Submits the start instant as "starts_at".
export function RaidDatePicker({ onPick }: { onPick?: () => void }) {
  const today = realmToday();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const [view, setView] = useState({ year: todayYear, month: todayMonth - 1 });
  const [date, setDate] = useState("");
  const [time, setTime] = useState(DEFAULT_TIME);

  const first = new Date(Date.UTC(view.year, view.month, 1));
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Weeks start on Monday.
  const isCurrentMonth = view.year === todayYear && view.month === todayMonth - 1;

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const startsAt = date ? realmTimeToDate(date, time) : null;
  const localTime = startsAt?.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const realmLabel = startsAt
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }) + `, ${time}`
    : null;

  return (
    <div className="space-y-2">
      <div className="rounded border border-border bg-background p-2">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={isCurrentMonth}
            aria-label="Previous month"
            className="rounded px-2 py-0.5 hover:bg-foreground/5 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="text-sm font-medium">{MONTH.format(first)}</span>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="rounded px-2 py-0.5 hover:bg-foreground/5"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1 text-xs opacity-50">
              {d}
            </span>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = iso(view.year, view.month, i + 1);
            const past = day < today;
            const selected = day === date;
            return (
              <button
                key={day}
                type="button"
                disabled={past}
                onClick={() => {
                  setDate(day);
                  onPick?.();
                }}
                className={`rounded py-1 tabular-nums ${
                  selected
                    ? "bg-accent font-medium text-accent-foreground"
                    : day === today
                      ? "ring-1 ring-accent/60 hover:bg-foreground/5"
                      : "hover:bg-foreground/5"
                } disabled:opacity-25 disabled:hover:bg-transparent`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Start time (server time)"
          className="rounded border border-border bg-background px-2 py-1.5 tabular-nums"
        >
          {TIMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-sm opacity-70">server time</span>
      </div>
      <p className={`text-xs ${startsAt ? "opacity-70" : "text-warn"}`}>
        {startsAt
          ? `${realmLabel} server time${localTime && !localTime.endsWith(time) ? ` · ${localTime} your time` : ""}`
          : "Pick a day"}
      </p>
      <input type="hidden" name="starts_at" value={startsAt?.toISOString() ?? ""} />
    </div>
  );
}
