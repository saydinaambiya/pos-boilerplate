"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Longest a navigation may keep the bar up without the URL changing. */
const NAVIGATION_TIMEOUT_MS = 15_000;

let pendingCount = 0;
let navigating = false;
let navigationTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isBusy() {
  return navigating || pendingCount > 0;
}

function setNavigating(value: boolean) {
  clearTimeout(navigationTimer);
  if (value) {
    navigationTimer = setTimeout(() => {
      setNavigating(false);
    }, NAVIGATION_TIMEOUT_MS);
  }
  if (navigating === value) return;
  navigating = value;
  emit();
}

/**
 * Registers pending work (a Server Action, a filter transition) with the
 * global loading indicator while `pending` is true (FR-UX-08).
 */
export function useGlobalPending(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    pendingCount += 1;
    emit();
    return () => {
      pendingCount -= 1;
      emit();
    };
  }, [pending]);
}

/** A same-origin link click that will trigger a client navigation to another URL. */
function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/** Pause before the indicator appears, so quick responses do not flash it. */
const SHOW_DELAY_MS = 200;

/**
 * Loading animation in the middle of the screen, shown whenever a page
 * navigation or registered action is in flight (FR-UX-08). Link clicks are
 * observed in the capture phase, before `next/link` calls `preventDefault`,
 * and end when the URL changes. It appears
 * after a short delay, never blocks the pointer or keyboard, and gives
 * screen readers a polite "loading" status; with reduced motion the
 * spinner stands still but the label stays (FR-UX-07). Needs a Suspense
 * boundary because it reads search params.
 */
export function LoadingIndicator({ label }: { label: string }) {
  const busy = useSyncExternalStore(subscribe, isBusy, () => false);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    setNavigating(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [busy]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) setNavigating(true);
    };
    const onPopState = () => {
      setNavigating(true);
    };
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="loading-indicator"
        data-busy={busy ? "true" : "false"}
        className={
          visible
            ? "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-canvas/40"
            : "hidden"
        }
      >
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-8 py-6 shadow-card">
          <span className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <span className="text-sm font-medium text-ink">{label}</span>
        </div>
      </div>
      <p role="status" className="sr-only">
        {visible ? label : ""}
      </p>
    </>
  );
}
