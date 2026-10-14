import { iconUrl, qualityColor, wowheadItemUrl } from "@/lib/loot";

// An item's icon and quality-coloured name, linking to Wowhead's Forever database.
export function ItemLink({
  item,
  size = "md",
}: {
  item: { id: number; name: string; quality: number; icon: string | null };
  size?: "sm" | "md";
}) {
  return (
    <a
      href={wowheadItemUrl(item.id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-2 hover:underline"
      style={{ color: qualityColor(item.quality) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl(item.icon)}
        alt=""
        className={`${size === "sm" ? "h-5 w-5" : "h-7 w-7"} shrink-0 rounded border border-black/40`}
      />
      <span className="truncate">{item.name}</span>
    </a>
  );
}
