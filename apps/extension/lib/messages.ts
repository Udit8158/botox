import { browser } from "wxt/browser";
import type { SyncDocument } from "@botox/shared";

/**
 * Typed RPC between UI (popup/options) and the background service worker.
 *
 * Why: a browser-action popup is destroyed as soon as it loses focus, so any
 * long async work started there (like OAuth, which opens another window) is
 * abandoned. Running it in the background means it completes regardless of
 * whether the popup stays open.
 */

export type RpcRequest =
  | { type: "status" }
  | { type: "signin" }
  | { type: "signout" }
  | { type: "sync" }
  | { type: "dump" }
  | { type: "reset" }
  | { type: "purge" };

export interface StatusData {
  email: string | null;
  lastSyncedAt: number | null;
}
export interface SyncData {
  total: number;
  created: number;
  removed: number;
}
export interface DumpData {
  revision: string | null;
  document: SyncDocument | null;
}
export interface ResetData {
  ok: true;
}
export interface PurgeData {
  removed: number;
}

export interface RpcResultMap {
  status: StatusData;
  signin: StatusData;
  signout: StatusData;
  sync: SyncData;
  dump: DumpData;
  reset: ResetData;
  purge: PurgeData;
}

export type RpcResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/** Call the background worker and unwrap the result (throws on error). */
export async function rpc<K extends RpcRequest["type"]>(
  req: Extract<RpcRequest, { type: K }>,
): Promise<RpcResultMap[K]> {
  const res = (await browser.runtime.sendMessage(req)) as RpcResponse<
    RpcResultMap[K]
  >;
  if (!res || !res.ok) {
    throw new Error(res?.error ?? "No response from background worker.");
  }
  return res.data;
}
