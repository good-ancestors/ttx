"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function FullScreenOverlay({
  title,
  onClose,
  children,
  bodyClassName,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 bg-navy-dark z-[70] flex flex-col p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <span className="text-lg font-semibold uppercase tracking-wider text-text-light">{title}</span>
        <button onClick={onClose} className="text-text-light hover:text-white p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className={bodyClassName ?? "flex-1 overflow-y-auto"}>{children}</div>
    </div>,
    document.body,
  );
}
