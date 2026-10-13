import Image from "next/image";

// Spell icon for a spec (public/specs/<spec id>.jpg).
export function SpecIcon({ specId, name, size = 20 }: { specId: string; name: string; size?: number }) {
  return (
    <Image
      src={`/specs/${specId}.jpg`}
      alt={name}
      title={name}
      width={size}
      height={size}
      className="shrink-0 rounded-sm ring-1 ring-black/60"
    />
  );
}
