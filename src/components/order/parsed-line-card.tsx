"use client";

import { Badge } from "@/components/ui/badge";
import type { parseOrderText } from "@/lib/text-parser";

interface ParsedLineCardProps {
  line: ReturnType<typeof parseOrderText>[number];
}

export function ParsedLineCard({ line }: ParsedLineCardProps) {
  const isMatched = line.item !== null;
  const isLowConfidence = isMatched && line.confidence < 0.5;

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
      !isMatched
        ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/15"
        : isLowConfidence
        ? "border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/15"
        : "border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/15"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground truncate">{line.raw}</div>
        {isMatched ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-sm font-medium text-foreground">{line.item!.name}</span>
            <span className="text-xs text-muted-foreground">× {line.quantity} {line.item!.unit}</span>
            {isLowConfidence && (
              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-500/30 h-4">低信心</Badge>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-600 dark:text-red-400 font-medium mt-0.5">⚠ {line.errorReason}</div>
        )}
      </div>
    </div>
  );
}
