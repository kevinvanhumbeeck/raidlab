"use client";

import Script from "next/script";

// Wowhead's script shows its item tooltip on hover over any wowhead.com/forever/item= link.
// It must not restyle the links: ItemLink draws its own icon and quality colour.
if (typeof window !== "undefined") {
  Object.assign(window, {
    whTooltips: { colorLinks: false, iconizeLinks: false, renameLinks: false },
  });
}

export function WowheadTooltips() {
  return (
    <Script src="https://wow.zamimg.com/js/tooltips.js" strategy="lazyOnload" />
  );
}
