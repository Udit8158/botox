import { browser } from "wxt/browser";
import { PULL_INTERVAL_MIN, PUSH_DEBOUNCE_MS } from "@botox/shared";
import type { RpcRequest, RpcResultMap } from "../lib/messages";
import {
  auth,
  drive,
  getLastSyncedAt,
  isApplying,
  purgeAll,
  resetSync,
  syncNow,
} from "../lib/sync";

/**
 * Background service worker. Owns all auth + Drive work (survives the popup
 * closing) and drives automatic sync:
 *   - bookmark change events  -> debounced push
 *   - periodic alarm          -> pull other devices' changes
 *   - startup / install       -> sync
 * A guard (isApplying) stops our own apply-writes from re-triggering a sync.
 */
const ALARM = "botox-periodic-sync";

export default defineBackground(() => {
  console.log("[botox] background ready");

  // --- RPC from popup/options ----------------------------------------------
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message as RpcRequest)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) =>
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
    return true; // keep the channel open for the async response
  });

  // --- Automatic sync ------------------------------------------------------
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let rerun = false;

  async function runSync(reason: string) {
    if (!(await auth.isAuthenticated())) return; // nothing to sync until signed in
    if (running) {
      rerun = true; // a change landed mid-sync; run once more after
      return;
    }
    running = true;
    try {
      const r = await syncNow();
      console.log(`[botox] auto-sync (${reason}):`, r);
    } catch (e) {
      console.warn(`[botox] auto-sync (${reason}) failed:`, e);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        scheduleSync("rerun");
      }
    }
  }

  function scheduleSync(reason: string) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSync(reason), PUSH_DEBOUNCE_MS);
  }

  function onBookmarkEvent() {
    if (isApplying()) return; // ignore the writes we make while applying
    scheduleSync("bookmark-change");
  }

  browser.bookmarks.onCreated.addListener(onBookmarkEvent);
  browser.bookmarks.onRemoved.addListener(onBookmarkEvent);
  browser.bookmarks.onChanged.addListener(onBookmarkEvent);
  browser.bookmarks.onMoved.addListener(onBookmarkEvent);

  browser.alarms.create(ALARM, { periodInMinutes: PULL_INTERVAL_MIN });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runSync("alarm");
  });

  browser.runtime.onStartup.addListener(() => void runSync("startup"));
  browser.runtime.onInstalled.addListener(() => void runSync("installed"));
});

async function handle(req: RpcRequest): Promise<RpcResultMap[RpcRequest["type"]]> {
  switch (req.type) {
    case "status":
      return { email: await auth.getAccountLabel(), lastSyncedAt: await getLastSyncedAt() };
    case "signin":
      await auth.authenticate();
      // Kick off an initial sync so the user doesn't have to press Sync now.
      await syncNow().catch((e) => console.warn("[botox] initial sync failed:", e));
      return { email: await auth.getAccountLabel(), lastSyncedAt: await getLastSyncedAt() };
    case "signout":
      await auth.signOut();
      return { email: null, lastSyncedAt: await getLastSyncedAt() };
    case "sync":
      return await syncNow();
    case "dump": {
      const blob = await drive.read();
      return { revision: blob.revision, document: blob.document };
    }
    case "reset":
      await resetSync();
      return { ok: true };
    case "purge":
      return await purgeAll();
  }
}
