import { getDisposition } from "@/lib/game-data";
import { EyeOff } from "lucide-react";

export function DispositionBadge({ disposition, className }: { disposition: string; className?: string }) {
  const disp = getDisposition(disposition);
  if (!disp) return null;
  return (
    <div className={`bg-[#1E1B4B] rounded-xl p-4 border border-[#4338CA] ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <EyeOff className="w-3.5 h-3.5 text-[#A78BFA]" />
        <span className="text-sm font-bold text-white">Hidden Alignment: {disp.label}</span>
        <span className="text-[10px] text-[#A78BFA] ml-auto">Secret — locked for game</span>
      </div>
      {disp.description && (
        <p className="text-xs text-[#C4B5FD] leading-relaxed">{disp.description}</p>
      )}
    </div>
  );
}
