import { DriveAdapter, type StorageAdapter } from "@botox/storage";
import { WebGoogleAuthProvider } from "../auth/web-google-auth";
import { MockAdapter } from "./mock-adapter";

/** Mock mode (in-memory sample data, no Google) when the URL has `?mock=1`. */
export function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

export interface AdapterBundle {
  adapter: StorageAdapter;
  /** Best-effort signed-in account label (email), or null. */
  accountLabel: () => Promise<string | null>;
}

export function createAdapter(): AdapterBundle {
  if (isMockMode()) {
    return { adapter: new MockAdapter(), accountLabel: async () => "Sample data" };
  }
  const auth = new WebGoogleAuthProvider();
  return { adapter: new DriveAdapter(auth), accountLabel: () => auth.getAccountLabel() };
}

const DEVICE_KEY = "botox.web.deviceId";

/** A stable id for this browser, used as the document's `deviceId`. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
