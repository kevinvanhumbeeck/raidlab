import { Cross, Shield, Sword, type LucideIcon } from "lucide-react";
import { ROLE_NAMES, type Role } from "@/lib/wow";

const ICONS: Record<Role, LucideIcon> = { tank: Shield, healer: Cross, dps: Sword };

// Small, dimmed tank/healer/DPS marker next to a character, in the spirit of the classic role icons.
export function RoleIcon({ role, className = "opacity-60" }: { role: Role; className?: string }) {
  const Icon = ICONS[role];
  return (
    <span title={ROLE_NAMES[role]} className={`inline-flex shrink-0 ${className}`}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">{ROLE_NAMES[role]}</span>
    </span>
  );
}
