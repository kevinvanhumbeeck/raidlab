import Link from "next/link";

const link = "rounded border border-border px-3 py-1 hover:bg-foreground/5";
const off = "rounded border border-transparent px-3 py-1 opacity-40";

// Newer / older links under a list that's newest first. A null href means there's nothing that way; with neither,
// the list fits on one page and nothing is shown.
export function Pager({ newer, older }: { newer: string | null; older: string | null }) {
  if (!newer && !older) return null;
  return (
    <nav className="flex justify-between text-sm" aria-label="Pages">
      {newer ? (
        <Link href={newer} className={link}>
          ← Newer
        </Link>
      ) : (
        <span className={off}>← Newer</span>
      )}
      {older ? (
        <Link href={older} className={link}>
          Older →
        </Link>
      ) : (
        <span className={off}>Older →</span>
      )}
    </nav>
  );
}

// The page number from a ?page= search param: 1 when missing or invalid.
export function pageParam(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : 1;
}
