import { FileText } from "lucide-react";

interface Lab {
  name: string;
  spec?: string;
}

export function LabSpecsPanel({ labs, defaultOpen }: { labs: Lab[]; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="bg-white rounded-xl border border-border p-4">
      <summary className="flex items-center gap-2 cursor-pointer">
        <FileText className="w-4 h-4 text-text" />
        <span className="text-sm font-bold text-text">Lab Specs</span>
      </summary>
      <p className="text-xs text-text-muted mt-2 mb-3">
        Current specs set by each lab&apos;s CEO. Your behaviour should be informed by these specs (and your secret disposition).
      </p>
      <div className="space-y-2">
        {labs.map((lab) => (
          <div key={lab.name} className="bg-off-white rounded-lg p-3 border border-border">
            <span className="text-xs font-bold text-text">{lab.name}</span>
            <p className="text-xs text-text-muted mt-1 whitespace-pre-line">
              {lab.spec || "No spec set yet."}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
