"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { ItemDiscount } from "@/lib/money/calculate";

export interface CartItem {
  variantId: string;
  name: string;
  /** Colour plus size or cut length, as shown in the cart. */
  colorName: string | null;
  unitPrice: number;
  qty: number;
  /** Custom cut off a roll, in cm per unit (FR-ROL-04). */
  lengthCm?: number;
  discount: ItemDiscount | null;
}

/** Cart line identity: a variant, or a variant cut to one length (FR-ROL-04). */
export function cartLineKey(item: { variantId: string; lengthCm?: number | undefined }): string {
  return item.lengthCm === undefined
    ? item.variantId
    : `${item.variantId}@${String(item.lengthCm)}`;
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
    item.qty > 0 &&
    (item.lengthCm === undefined ||
      (typeof item.lengthCm === "number" && Number.isInteger(item.lengthCm) && item.lengthCm > 0))
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
          const key = cartLineKey(item);
          const existing = current.find((line) => cartLineKey(line) === key);
          if (!existing)
            return maxQty === 0 ? current : [...current, { ...item, qty: 1, discount: null }];
          if (maxQty !== null && existing.qty >= maxQty) return current;
          return current.map((line) => (line === existing ? { ...line, qty: line.qty + 1 } : line));
        });
      },
      [update],
    ),
    setQty: useCallback(
      (key: string, qty: number) => {
        update((current) =>
          qty <= 0
            ? current.filter((line) => cartLineKey(line) !== key)
            : current.map((line) => (cartLineKey(line) === key ? { ...line, qty } : line)),
        );
      },
      [update],
    ),
    setDiscount: useCallback(
      (key: string, discount: ItemDiscount | null) => {
        update((current) =>
          current.map((line) => (cartLineKey(line) === key ? { ...line, discount } : line)),
        );
      },
      [update],
    ),
    remove: useCallback(
      (key: string) => {
        update((current) => current.filter((line) => cartLineKey(line) !== key));
      },
      [update],
    ),
    clear: useCallback(() => {
      write(storageKey, EMPTY);
    }, [storageKey]),
  };
}
