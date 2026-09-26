"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { ItemDiscount } from "@/lib/money/calculate";

export interface CartItem {
  variantId: string;
  name: string;
  colorName: string | null;
  unitPrice: number;
  qty: number;
  discount: ItemDiscount | null;
}

const EMPTY = "[]";
const listeners = new Set<() => void>();
/** Used when storage is blocked (private mode, disabled site data). */
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? EMPTY;
  } catch {
    return memory.get(key) ?? EMPTY;
  }
}

function write(key: string, value: string) {
  try {
    if (value === EMPTY) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
  for (const listener of listeners) listener();
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.variantId === "string" &&
    typeof item.name === "string" &&
    typeof item.unitPrice === "number" &&
    typeof item.qty === "number" &&
    Number.isInteger(item.qty) &&
    item.qty > 0
  );
}

function parse(raw: string): CartItem[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

/**
 * Cart persisted per device and cashier so a refresh never loses it
 * (FR-POS-05). Server render sees an empty cart; the stored one appears
 * after hydration without a mismatch.
 */
export function useCart(storageKey: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => EMPTY,
  );
  const items = useMemo(() => parse(raw), [raw]);

  const update = useCallback(
    (change: (current: CartItem[]) => CartItem[]) => {
      write(storageKey, JSON.stringify(change(parse(read(storageKey)))));
    },
    [storageKey],
  );

  return {
    items,
    add: useCallback(
      (item: Omit<CartItem, "qty" | "discount">, maxQty: number | null) => {
        update((current) => {
          const existing = current.find((line) => line.variantId === item.variantId);
          if (!existing)
            return maxQty === 0 ? current : [...current, { ...item, qty: 1, discount: null }];
          if (maxQty !== null && existing.qty >= maxQty) return current;
          return current.map((line) => (line === existing ? { ...line, qty: line.qty + 1 } : line));
        });
      },
      [update],
    ),
    setQty: useCallback(
      (variantId: string, qty: number) => {
        update((current) =>
          qty <= 0
            ? current.filter((line) => line.variantId !== variantId)
            : current.map((line) => (line.variantId === variantId ? { ...line, qty } : line)),
        );
      },
      [update],
    ),
    setDiscount: useCallback(
      (variantId: string, discount: ItemDiscount | null) => {
        update((current) =>
          current.map((line) => (line.variantId === variantId ? { ...line, discount } : line)),
        );
      },
      [update],
    ),
    remove: useCallback(
      (variantId: string) => {
        update((current) => current.filter((line) => line.variantId !== variantId));
      },
      [update],
    ),
    clear: useCallback(() => {
      write(storageKey, EMPTY);
    }, [storageKey]),
  };
}
