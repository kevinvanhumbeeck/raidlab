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
export function gargulExport(raid: { slug: string; starts_at: string }, rows: ReserveExportRow[], url: string) {
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
    hardreserves: [],
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
