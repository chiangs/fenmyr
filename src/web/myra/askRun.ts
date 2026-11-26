import type { ChatMsg } from '../../shared/chat.ts';
import { markStopped } from './chatLog.ts';
import type { Job } from './status.ts';
import { addStoppable } from './stop.ts';

/** One question to Claude, from the moment it is asked until its answer starts to land, as far as stopping goes. It is
 *  listed as stoppable at once, so a question still waiting behind another counts. `mine`: the person's line in the
 *  chat, which is marked when this is stopped. */
export class AskRun {
  /** Names this question to the host, which stops its Claude Code by it. */
  readonly id = crypto.randomUUID();
  #stopped = false;
  #sent = false;
  #job: Job | null = null;
  readonly #off: () => void;

  constructor(board: string, mine: ChatMsg | undefined) {
    this.#off = addStoppable({
      board,
      stop: () => {
        this.#stopped = true;
        if (mine) markStopped(mine);
        this.#job?.end();
        // before the call is made there is nothing to kill, and `sent` is never called once this is stopped
        if (this.#sent) Fenmyr.askStop(this.id).catch(() => {});
      },
    });
  }

  /** True once the person has stopped it, and then nothing it was waiting for is to be used. */
  get stopped() {
    return this.#stopped;
  }

  /** The job showing that she is thinking on it, which stopping ends along with the request. */
  working(job: Job) {
    this.#job = job;
  }

  /** The call to Claude Code has been made, so stopping has a process to kill. */
  sent() {
    this.#sent = true;
  }

  /** Not stoppable any more: her answer is about to land, or there is no answer to wait for. */
  end() {
    this.#off();
  }
}
