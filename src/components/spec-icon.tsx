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

// Main spec icon followed by smaller, dimmed off-spec icons.
export function CharacterSpecs({
  mainSpecId,
  offSpecIds,
  specName,
}: {
  mainSpecId: string;
  offSpecIds: string[];
  specName: (specId: string) => string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <SpecIcon specId={mainSpecId} name={specName(mainSpecId)} size={20} />
      {offSpecIds.map((id) => (
        <span key={id} className="opacity-60">
          <SpecIcon specId={id} name={`Off-spec: ${specName(id)}`} size={16} />
        </span>
      ))}
    </span>
  );
}
