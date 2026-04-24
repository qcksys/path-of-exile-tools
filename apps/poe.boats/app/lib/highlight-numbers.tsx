import type { ReactNode } from "react";

export function highlightNumbers(text: string): ReactNode[] {
  const parts = text.split(/(\d+(?:\.\d+)?%?)/g);
  return parts.map((part, index) => {
    if (/^\d+(?:\.\d+)?%?$/.test(part)) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: split output positions are stable for a given input
        <span key={index} className="font-semibold text-foreground">
          {part}
        </span>
      );
    }
    return part;
  });
}
