"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
export type Command = { label: string; run: () => void; disabled?: boolean };
export function CommandMenu({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [q, setQ] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto w-[min(92vw,520px)] rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Quick actions</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close · Esc
        </Button>
      </div>
      <label className="block">
        <span className="sr-only">Find an action</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background p-3 text-sm"
          placeholder="Find an action…"
        />
      </label>
      <div className="space-y-2">
        {commands
          .filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
          .map((c) => (
            <Button
              key={c.label}
              variant="ghost"
              className="w-full justify-start"
              disabled={c.disabled}
              onClick={() => {
                onClose();
                c.run();
              }}
            >
              {c.label}
            </Button>
          ))}
        {!commands.some((c) =>
          c.label.toLowerCase().includes(q.toLowerCase()),
        ) && (
          <p className="p-3 text-sm text-muted-foreground">No actions match.</p>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Ctrl/Cmd+K opens actions. / focuses directory search. Tab navigates
        controls.
      </p>
    </dialog>
  );
}
