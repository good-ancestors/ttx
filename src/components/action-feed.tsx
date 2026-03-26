"use client";

import { ROLES, getProbabilityCard } from "@/lib/game-data";
import { motion, AnimatePresence } from "framer-motion";
import { Check, XCircle } from "lucide-react";

interface Submission {
  _id: string;
  roleId: string;
  actions: {
    text: string;
    priority: number;
    probability?: number;
    rolled?: number;
    success?: boolean;
  }[];
}

interface FeedItem {
  roleId: string;
  roleName: string;
  roleColor: string;
  text: string;
  priority: number;
  probability: number;
  rolled?: number;
  success?: boolean;
}

export function ActionFeed({
  submissions,
  onComplete,
}: {
  submissions: Submission[];
  onComplete: () => void;
}) {
  // Flatten all actions from all submissions into a single feed
  const feedItems: FeedItem[] = submissions.flatMap((sub) => {
    const role = ROLES.find((r) => r.id === sub.roleId);
    return sub.actions
      .filter((a) => a.probability != null)
      .map((a) => ({
        roleId: sub.roleId,
        roleName: role?.name ?? sub.roleId,
        roleColor: role?.color ?? "#94A3B8",
        text: a.text,
        priority: a.priority,
        probability: a.probability!,
        rolled: a.rolled,
        success: a.success,
      }));
  });

  const allResolved = feedItems.length > 0 && feedItems.every((f) => f.rolled != null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">Action Feed</h3>
        <span className="text-xs text-text-light font-mono">
          {feedItems.filter((f) => f.rolled != null).length}/{feedItems.length}{" "}
          resolved
        </span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-2">
        <AnimatePresence>
          {feedItems.map((item, i) => {
            const prob = getProbabilityCard(item.probability);
            const isResolved = item.rolled != null;

            return (
              <motion.div
                key={`${item.roleId}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${
                  isResolved ? "bg-navy" : "bg-navy-light/50"
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.roleColor }}
                />
                <span className="text-[13px] text-[#E2E8F0] flex-1 truncate">
                  {item.text}
                </span>
                <span
                  className="text-[11px] font-bold py-0.5 px-2 rounded-full shrink-0"
                  style={{ backgroundColor: prob.bgColor, color: prob.color }}
                >
                  {prob.pct}%
                </span>
                {isResolved ? (
                  <>
                    <span className="text-[13px] font-mono text-text-light w-8 text-right shrink-0">
                      {item.rolled}
                    </span>
                    {item.success ? (
                      <Check className="w-4 h-4 text-viz-safety shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-viz-danger shrink-0" />
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-navy-muted w-12 text-right shrink-0">
                    pending
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {allResolved && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onComplete}
          className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4
                     hover:bg-off-white transition-colors"
        >
          View Narrative Summary
        </motion.button>
      )}
    </div>
  );
}
