import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "../config/env.js";

export async function createJoinToken(roomCode: string, identity: string, name: string) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, name, ttl: "6h" });
  // canUpdateOwnMetadata: lets a person set their own attributes (e.g. hand raised).
  at.addGrant({
    room: roomCode,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });
  return at.toJwt();
}

const rooms = () => new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, "http"), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

/** Disconnects everyone. A room that's already gone is fine. */
export async function closeRoom(roomCode: string) {
  await rooms()
    .deleteRoom(roomCode)
    .catch(() => {});
}

/** True when nobody is connected or the room no longer exists. If LiveKit can't be reached we say "not empty",
 * so a live meeting is never ended by mistake. */
export async function isRoomEmpty(roomCode: string) {
  try {
    return (await rooms().listParticipants(roomCode)).length === 0;
  } catch (err) {
    return /not.?found|does not exist/i.test(String((err as Error)?.message));
  }
}
