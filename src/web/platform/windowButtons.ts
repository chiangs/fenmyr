// The Linux window has no title bar of its own, so the page draws these three buttons and asks the host to act.
const buttons: [selector: string, act: 'close' | 'minimize' | 'maximize'][] = [
  ['.wc-close', 'close'],
  ['.wc-min', 'minimize'],
  ['.wc-max', 'maximize'],
];

export function initWindowButtons() {
  for (const [selector, act] of buttons)
    document.querySelector(`#winCtl ${selector}`)?.addEventListener('click', () => window.fenmyrWindow?.[act]());
}
