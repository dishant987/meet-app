import { toast } from "sonner";
import { MediaDeviceFailure } from "livekit-client";

/** Clear, actionable text for camera/mic problems. */
export function deviceHelp(failure?: MediaDeviceFailure) {
  if (failure === MediaDeviceFailure.PermissionDenied)
    return "Camera/mic is blocked. Click the camera icon in the address bar, choose Allow, then reload.";
  if (failure === MediaDeviceFailure.NotFound) return "No camera or microphone found. You can still join and listen.";
  if (failure === MediaDeviceFailure.DeviceInUse) return "Your camera or mic is used by another app. Close it and try again.";
  return "Couldn't start your camera or mic.";
}

// Same id = sonner shows the message once even if mic and camera both fail.
export const deviceToast = (failure?: MediaDeviceFailure) => {
  const msg = deviceHelp(failure);
  toast.error(msg, { id: msg });
};

export const deviceErrorToast = (err: Error) => deviceToast(MediaDeviceFailure.getFailure(err));
