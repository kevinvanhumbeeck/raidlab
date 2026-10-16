"use client";

// Submit button that asks for confirmation first; for destructive form actions.
// Pass formAction to submit the surrounding form to a different action (without validating it).
export function ConfirmButton({
  message,
  formAction,
  className,
  disabled,
  title,
  children,
}: {
  message: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      formAction={formAction}
      disabled={disabled}
      title={title}
      formNoValidate={!!formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
