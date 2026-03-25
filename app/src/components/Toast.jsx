import { useState, useCallback } from "react";
import { colors, font, radius } from "../theme";

/**
 * useToast — hook that manages a queue of toast notifications.
 *
 * Returns { toasts, add, remove }.
 * Toasts auto-dismiss after 3.5 seconds.
 *
 * @returns {{ toasts: Array<{id: number, msg: string, type: string}>, add: Function, remove: Function }}
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const remove = useCallback(
    (id) => setToasts((p) => p.filter((t) => t.id !== id)),
    []
  );

  return { toasts, add, remove };
}

/**
 * Toast — renders the active toast stack in the bottom-right corner.
 *
 * @param {{ toasts: Array<{id: number, msg: string, type: string}>, remove: Function }} props
 */
export function Toast({ toasts, remove }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          style={{
            background:
              t.type === "error"   ? colors.error :
              t.type === "success" ? colors.success :
              "#1a1a1a",
            color: t.type === "success" ? colors.successText : colors.text,
            padding: "10px 18px",
            borderRadius: radius.md,
            fontSize: font.sizeLg,
            fontFamily: font.mono,
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            animation: "fadeSlideIn 0.2s ease",
            maxWidth: 320,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
