import { Loader2 } from "lucide-react";

/** Full-screen loader used by the table page and its observer/driver children
 *  while their queries warm up. Centralised so the spinner styling stays
 *  consistent across the three places that need it. */
export function TableLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-off-white">
      <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
    </div>
  );
}
