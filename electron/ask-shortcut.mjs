/** The Ask panel's global key (D21). A key another app holds is reported, never retried in a loop. */
export const ASK_ACCELERATOR = "Control+Alt+A";

export function createAskShortcut({ globalShortcut, onPress, log = () => {} }) {
  let registered = false, taken = false;
  try {
    registered = globalShortcut.register(ASK_ACCELERATOR, onPress) === true;
  } catch (error) {
    log(`ask shortcut register failed: ${error?.message ?? error}`);
  }
  if (!registered) {
    taken = true;
    log(`ask shortcut ${ASK_ACCELERATOR} is taken by another app`);
  }
  return {
    state: () => ({ accelerator: ASK_ACCELERATOR, registered, taken }),
    close() {
      if (registered) globalShortcut.unregister(ASK_ACCELERATOR);
      registered = false;
    },
  };
}
