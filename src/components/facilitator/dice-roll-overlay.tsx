"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Dices } from "lucide-react";

const DURATION = 2500;
const CYCLE_INTERVAL = 80;

export function DiceRollOverlay({ onComplete }: { onComplete: () => void }) {
  const [displayNumber, setDisplayNumber] = useState(
    () => Math.floor(Math.random() * 100) + 1
  );
  const [frozen, setFrozen] = useState(false);

  const complete = useCallback(() => onComplete(), [onComplete]);

  // Auto-dismiss after full duration
  useEffect(() => {
    const timer = setTimeout(complete, DURATION);
    return () => clearTimeout(timer);
  }, [complete]);

  // Freeze the number at 2000ms
  useEffect(() => {
    const timer = setTimeout(() => setFrozen(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Cycle random numbers while not frozen
  useEffect(() => {
    if (frozen) return;
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 100) + 1);
    }, CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [frozen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-[#0F172A]" />

      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06)_0%,transparent_60%)]" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-4">
        {/* Label */}
        <span className="text-xs uppercase tracking-[0.3em] text-text-light font-semibold">
          Rolling&hellip;
        </span>

        {/* Dice icon */}
        <motion.div
          initial={{ scale: 0.3, rotate: -180 }}
          animate={{
            scale: 1,
            rotate: [0, -15, 15, -10, 10, 0, -12, 12, -8, 8, 0],
            y: [0, -8, 0, -6, 0, -8, 0, -6, 0, -4, 0],
          }}
          transition={{
            scale: { duration: 0.4, delay: 0.2, type: "spring", stiffness: 200 },
            rotate: {
              duration: 1.2,
              delay: 0.6,
              ease: "easeInOut",
            },
            y: {
              duration: 1.2,
              delay: 0.6,
              ease: "easeInOut",
            },
          }}
          className="drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]"
        >
          <Dices className="w-12 h-12 text-white" />
        </motion.div>

        {/* Number display */}
        <motion.span
          className="font-mono text-4xl font-black text-white tabular-nums"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.15 }}
        >
          {displayNumber}
        </motion.span>

        {/* Flash ring on freeze */}
        {frozen && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-white pointer-events-none"
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </div>

      {/* Fade out at end */}
      <motion.div
        className="absolute inset-0 bg-[#0F172A] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 0.3 }}
      />
    </motion.div>,
    document.body
  );
}
