import "server-only";
import { deflateSync } from "node:zlib";

// Exports soft reserves for Gargul, the loot addon with a WoW Forever build. Officers paste the result into
// `/gl sr` in game. Format from Gargul's Classes/SoftRes.lua (importGargulData / importCSVData).

export type ReserveExportRow = {
  character: string;
  className: string;
  itemId: number;
  itemName: string;
  boss: string | null;
  createdAt: string;
};

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// base64(zlib(JSON)), the "Gargul export" string softres.it produces.
export function gargulExport(
  raid: { slug: string; starts_at: string },
  rows: ReserveExportRow[],
  hardReserves: number[],
  url: string,
) {
  const players = new Map<
    string,
    { name: string; class: string; note: string; plusOnes: number; items: { id: number }[] }
  >();
  for (const row of rows) {
    const player = players.get(row.character) ?? {
      name: row.character,
      // Gargul matches lowercase class names and falls back to priest for anything else.
      class: row.className.toLowerCase(),
      note: "",
      plusOnes: 0,
      items: [],
    };
    player.items.push({ id: row.itemId });
    players.set(row.character, player);
  }

  const updatedAt = rows.reduce((latest, row) => Math.max(latest, unix(row.createdAt)), 0);
  const data = {
    metadata: {
      id: raid.slug,
      createdAt: updatedAt,
      updatedAt,
      raidStartsAt: unix(raid.starts_at),
      hidden: false,
      url,
    },
    softreserves: [...players.values()],
    // Gargul runs tostring() on "for" and "note", so missing values would import as "nil".
    hardreserves: hardReserves.map((id) => ({ id, for: "", note: "" })),
  };
  return deflateSync(Buffer.from(JSON.stringify(data))).toString("base64");
}

// softres.it's CSV layout, which LootReserve and other soft-reserve addons import too. Gargul splits on
// commas without quoting, so commas are dropped from the values.
export function softresCsv(rows: ReserveExportRow[]) {
  const clean = (value: string | number | null) =>
    String(value ?? "")
      .replaceAll(",", "")
      .replaceAll("\n", " ");
  const lines = rows.map((row) =>
    [row.itemName, row.itemId, row.boss, row.character, row.className, "", "", 0, row.createdAt].map(clean).join(","),
  );
  return ["Item,ItemId,From,Name,Class,Spec,Note,Plus,Date", ...lines].join("\n");
}

// Roster for Gargul's raid groups window (`/gl groups`): it invites everyone, shows who's missing, sorts the
// raid into these groups and assigns main tanks. One line per group, "1:Name,Name,...", and line 9 lists the
// tanks. Format from Gargul's Classes/RaidGroups.lua (applyRaidGroups). Empty groups are left out, as Gargul
// can't read a line without names.
export function gargulGroups(slots: { groupNo: number; position: number; name: string; tank: boolean }[]) {
  const sorted = [...slots].sort((a, b) => a.groupNo - b.groupNo || a.position - b.position);
  const groups = new Map<number, typeof slots>();
  for (const slot of sorted) groups.set(slot.groupNo, [...(groups.get(slot.groupNo) ?? []), slot]);
  const lines = [...groups].map(([groupNo, members]) => `${groupNo}:${members.map((m) => m.name).join(",")}`);
  const tanks = sorted.filter((slot) => slot.tank).map((slot) => slot.name);
  if (tanks.length) lines.push(`9:${tanks.join(",")}`);
  return lines.join("\n");
}
