import { ConnectionState, RoomEvent, type Room } from "livekit-client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForConnected(room: Room, timeoutMs: number) {
  if (room.state === ConnectionState.Connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(t);
      room.off(RoomEvent.Connected, done);
      resolve();
    };
    const t = setTimeout(() => {
      room.off(RoomEvent.Connected, done);
      reject(new Error("not connected"));
    }, timeoutMs);
    room.on(RoomEvent.Connected, done);
  });
}

/**
 * Sets one of my participant attributes (hand raised, captions on…) so everyone sees it.
 * Clicking right after joining used to time out silently; this waits for the connection and retries.
 */
export async function setMyAttribute(room: Room, key: string, value: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await waitForConnected(room, 10_000);
      await room.localParticipant.setAttributes({ [key]: value });
      return;
    } catch (err) {
      lastError = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}
