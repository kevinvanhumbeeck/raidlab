"use client";

import { useState } from "react";

// Copies text to the clipboard, e.g. an addon import string.
export function CopyButton({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : children}
    </button>
  );
}

// Offers text as a file download, e.g. a CSV export.
export function DownloadButton({
  text,
  filename,
  type = "text/csv",
  className,
  children,
}: {
  text: string;
  filename: string;
  type?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {children}
    </button>
  );
}
