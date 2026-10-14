"use client";

import { useState } from "react";

// navigator.clipboard only exists on secure pages (HTTPS or localhost). On plain HTTP, such as the dev
// server opened by IP address, fall back to copying from a hidden textarea.
async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const textarea = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copying is blocked by the browser");
}

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
        await copyText(text);
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
