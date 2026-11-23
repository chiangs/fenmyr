import { fileURLToPath } from 'node:url';
import type { WebFrameMain } from 'electron';
import { isRecord } from './util.ts';

type Frame = Pick<WebFrameMain, 'url'>;

const samePage = (url: string, page: string) => {
  try {
    return fileURLToPath(url) === page;
  } catch {
    return false;
  }
};

// The bridge reaches files, git and Claude, so it answers only the app's own page in the window's main frame. A frame
// inside that page, or another page the window was sent to, gets nothing.
export function fromAppPage(
  sender: Frame | null,
  main: Frame | undefined,
  page: string,
  channel: string,
  msg: unknown,
) {
  if (sender && sender === main && samePage(sender.url, page)) return true;
  const op = typeof msg === 'string' ? msg : isRecord(msg) ? msg.op : undefined;
  const where = sender ? sender.url : 'a frame that is gone';
  console.warn(`Fenmyr dropped ${channel} ${JSON.stringify(op)} from ${JSON.stringify(where.slice(0, 200))}`);
  return false;
}
