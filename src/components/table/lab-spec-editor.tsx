import { FileText, CheckCircle2 } from "lucide-react";

export function LabSpecEditor({
  labSpec,
  onLabSpecChange,
  specSaved,
  onSaveSpec,
}: {
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-text" />
        <span className="text-sm font-bold text-text">Your Lab&apos;s AI Spec</span>
      </div>
      <p className="text-xs text-text-muted mb-2">
        What is your AI instructed to do? This is public and affects how faithfully the AI follows your direction.
      </p>
      <textarea
        value={labSpec}
        onChange={(e) => { onLabSpecChange(e.target.value); }}
        placeholder="e.g. 'Maximise capability R&D while maintaining 10% safety budget'"
        rows={2}
        className="w-full p-2 bg-off-white border border-border rounded text-sm text-text resize-none outline-none placeholder:text-text-muted/50"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={onSaveSpec}
          disabled={!labSpec.trim()}
          className="text-xs px-3 py-1.5 bg-navy text-white rounded font-bold hover:bg-navy/90 disabled:opacity-30"
        >
          Save Spec
        </button>
        {specSaved && (
          <span className="text-xs text-[#059669] font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
