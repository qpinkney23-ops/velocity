"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

type ToastInput = {
  type?: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
};

type ToastContextValue = {
  toast: (t: ToastInput) => void;
};

const ToastCtx = createContext<ToastContextValue | null>(null);

function id() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function tone(t: ToastType) {
  if (t === "success") return { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)", text: "rgba(6,95,70,0.98)" };
  if (t === "error") return { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.22)", text: "rgba(153,27,27,0.98)" };
  return { bg: "rgba(31,111,235,0.08)", border: "rgba(31,111,235,0.22)", text: "rgba(15,23,42,0.88)" };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const remove = useCallback((toastId: string) => {
    setItems((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const item: Toast = {
        id: id(),
        type: t.type ?? "info",
        title: t.title,
        message: t.message,
      };

      setItems((prev) => [item, ...prev].slice(0, 4)); // max 4

      const duration = typeof t.durationMs === "number" ? t.durationMs : 2400;
      window.setTimeout(() => remove(item.id), duration);
    },
    [remove]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}

      {/* Viewport */}
      <div
        className="fixed z-[1000] right-4 top-4 space-y-2"
        style={{ width: 360, maxWidth: "calc(100vw - 32px)" }}
      >
        {items.map((t) => {
          const c = tone(t.type);
          return (
            <div
              key={t.id}
              className="rounded-2xl border p-3 shadow-sm"
              style={{
                background: "rgba(255,255,255,0.95)",
                borderColor: "rgba(15,23,42,0.10)",
                boxShadow: "0 18px 46px rgba(15,23,42,0.14)",
              }}
            >
              <div
                className="rounded-xl border px-3 py-2 flex items-start justify-between gap-2"
                style={{ background: c.bg, borderColor: c.border }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: c.text }}>
                    {t.title}
                  </div>
                  {t.message ? (
                    <div className="text-xs mt-1" style={{ color: "rgba(15,23,42,0.62)" }}>
                      {t.message}
                    </div>
                  ) : null}
                </div>

                <button
                  className="text-xs px-2 py-1 rounded-xl border"
                  style={{
                    borderColor: "rgba(15,23,42,0.10)",
                    background: "rgba(255,255,255,0.70)",
                    color: "rgba(15,23,42,0.70)",
                  }}
                  onClick={() => remove(t.id)}
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider />");
  }
  return ctx;
}
