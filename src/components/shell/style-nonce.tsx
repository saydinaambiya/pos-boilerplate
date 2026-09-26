"use client";

import { getNonce, setNonce } from "get-nonce";

/**
 * Hands the document's CSP nonce to libraries that inject `<style>` at
 * runtime (Radix scroll lock via react-style-singleton). Only the first value
 * is kept: after client-side navigations the server renders with a new nonce,
 * but the browser still enforces the one from the initial document.
 */
export function StyleNonce({ nonce }: { nonce: string | undefined }) {
  if (nonce && typeof window !== "undefined" && !getNonce()) setNonce(nonce);
  return null;
}
