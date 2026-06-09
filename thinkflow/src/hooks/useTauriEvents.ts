import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface HotkeyEventPayload {
  action: "quick-capture" | "focus-mode";
}

/**
 * Hook that listens for Tauri hotkey events emitted from the Rust backend.
 * Returns the most recent event payload, or null if none received yet.
 */
export function useHotkeyEvents() {
  const [lastEvent, setLastEvent] = useState<HotkeyEventPayload | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      try {
        unlisten = await listen<HotkeyEventPayload>("hotkey-triggered", (event) => {
          setLastEvent(event.payload);
        });
      } catch (err) {
        console.warn("Failed to listen for hotkey events:", err);
      }
    };

    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  /** Reset the last event so it can be re-triggered. */
  const clearEvent = () => setLastEvent(null);

  return { lastEvent, clearEvent };
}
