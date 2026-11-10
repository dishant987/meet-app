// Remembers, per meeting, the host key (only on the creator's browser) and your participant id.
// They prove who you are to the notes API until accounts arrive in Phase 4.
const hostKeyName = (roomCode: string) => `meetapp-host:${roomCode}`;
const participantKeyName = (roomCode: string) => `meetapp-participant:${roomCode}`;

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: notes will need the same tab session */
  }
}

export const saveHostKey = (roomCode: string, key: string) => write(hostKeyName(roomCode), key);
export const getHostKey = (roomCode: string) => read(hostKeyName(roomCode));
export const saveParticipantId = (roomCode: string, id: string) => write(participantKeyName(roomCode), id);

/** Headers that identify you for notes / transcript requests. */
export function accessHeaders(roomCode: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const host = getHostKey(roomCode);
  const participant = read(participantKeyName(roomCode));
  if (host) headers["x-host-key"] = host;
  if (participant) headers["x-participant-id"] = participant;
  return headers;
}
