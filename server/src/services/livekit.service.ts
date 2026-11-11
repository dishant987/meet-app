import { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { env } from "../config/env.js";

export async function createJoinToken(roomCode: string, identity: string, name: string, attributes?: Record<string, string>) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, name, ttl: "6h", attributes });
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

const gone = (err: unknown) => /not.?found|does not exist/i.test(String((err as Error)?.message));

/** Host mutes someone's microphone (they can turn it back on themselves). */
export async function muteMicrophone(roomCode: string, identity: string) {
  const client = rooms();
  const person = await client.getParticipant(roomCode, identity).catch((err) => (gone(err) ? null : Promise.reject(err)));
  const mics = (person?.tracks ?? []).filter((t) => t.source === TrackSource.MICROPHONE && !t.muted);
  await Promise.all(mics.map((t) => client.mutePublishedTrack(roomCode, identity, t.sid, true)));
  // tell only that person why their mic went off (best effort: the mute itself already happened)
  await client
    .sendData(roomCode, new TextEncoder().encode(JSON.stringify({ type: "muted-by-host" })), DataPacket_Kind.RELIABLE, {
      destinationIdentities: [identity],
      topic: "host",
    })
    .catch(() => {});
}

/** Host removes someone from the call. Already gone is fine. */
export async function removeFromRoom(roomCode: string, identity: string) {
  await rooms()
    .removeParticipant(roomCode, identity)
    .catch((err) => (gone(err) ? undefined : Promise.reject(err)));
}
