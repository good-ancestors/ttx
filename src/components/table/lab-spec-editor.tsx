import { FileText, CheckCircle2, AlertCircle } from "lucide-react";

export function LabSpecEditor({
  labSpec,
  onLabSpecChange,
  specSaved,
  onSaveSpec,
  readOnly = false,
  unsaved = false,
}: {
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
  readOnly?: boolean;
  unsaved?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-text" />
        <span className="text-sm font-bold text-text">Your Lab&apos;s AI Spec</span>
      </div>
      <p className="text-xs text-text-muted mb-2">
        Define your AI&apos;s core values, objectives, and constraints. This is public and shapes how the AI behaves &mdash; what it optimises for, what rules it follows, and how it resolves conflicts.
      </p>
      <textarea
        value={labSpec}
        onChange={(e) => { onLabSpecChange(e.target.value); }}
        readOnly={readOnly}
        placeholder="e.g. 'Be useful to your user. Follow the law. Be honest and transparent. If a request conflicts with a safety policy, state the conflict.'"
        rows={6}
        className="min-h-40 w-full rounded border border-border bg-off-white p-3 text-sm text-text outline-none placeholder:text-text-muted/50 read-only:cursor-default"
      />
      {!readOnly && (
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
          {unsaved && !specSaved && (
            <span className="text-xs text-[#D97706] font-medium flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Unsaved changes
            </span>
          )}
        </div>
      )}
    </div>
  );
}
