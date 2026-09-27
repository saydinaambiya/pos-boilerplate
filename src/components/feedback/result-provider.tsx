"use client";

import { createContext, type ReactNode, use, useState } from "react";

import { type ActionResult, ResultDialog } from "./result-dialog";

const ResultContext = createContext<((result: ActionResult) => void) | null>(null);

/**
 * One result dialog for the whole app frame. Actions that remove their own
 * form from the page (an approved request leaving the inbox, a deactivated
 * row) still show their outcome (FR-UX-05).
 */
export function ResultProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <ResultContext value={setResult}>
      {children}
      <ResultDialog
        result={result}
        onClose={() => {
          setResult(null);
        }}
      />
    </ResultContext>
  );
}

/** Opens the shared result dialog; null outside a `ResultProvider`. */
export function useShowResult() {
  return use(ResultContext);
}
