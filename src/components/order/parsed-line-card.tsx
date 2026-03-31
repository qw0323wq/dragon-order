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
        ? "border-red-200 bg-red-50"
        : isLowConfidence
        ? "border-orange-200 bg-orange-50"
        : "border-green-200 bg-green-50"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400 truncate">{line.raw}</div>
        {isMatched ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-sm font-medium text-gray-800">{line.item!.name}</span>
            <span className="text-xs text-gray-500">× {line.quantity} {line.item!.unit}</span>
            {isLowConfidence && (
              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 h-4">低信心</Badge>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-600 font-medium mt-0.5">⚠ {line.errorReason}</div>
        )}
      </div>
    </div>
  );
}
