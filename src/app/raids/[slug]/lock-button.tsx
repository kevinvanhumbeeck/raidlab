"use client";

// Lock or unlock sign-ups. With a warning (too few tanks or healers, see lockWarning), locking asks first.
export function LockButton({
  action,
  locked,
  warning,
}: {
  action: () => Promise<void>;
  locked: boolean;
  warning: string | null;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!locked && warning && !confirm(warning)) e.preventDefault();
      }}
      className="ml-auto"
    >
      <button className="rounded border border-border px-3 py-1 text-sm hover:bg-white/5">
        {locked ? "Unlock sign-ups" : "Lock sign-ups"}
      </button>
    </form>
  );
}
