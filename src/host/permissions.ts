import type { Session } from 'electron';

// The microphone for voice memos, the camera for video cards, the clipboard for copy and paste between boards and
// notifications for timers are for the app's own page. A frame inside it (a prototype's preview, an embed) gets none of
// them, so it can't listen, look or read what was copied. Fullscreen stays open to the Spotify embeds.
const MAIN_FRAME_ONLY = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications']);

const granted = (permission: string, mainFrame: boolean) =>
  permission === 'fullscreen' || (mainFrame && MAIN_FRAME_ONLY.has(permission));

export function limitPermissions(s: Session) {
  s.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(granted(permission, details.isMainFrame)),
  );
  s.setPermissionCheckHandler((_wc, permission, _origin, details) => granted(permission, details.isMainFrame));
}
