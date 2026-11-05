const NOT_HOLDING_KEYS = 'does not hold the keyboard'

/**
 * Reads one try at moving the focus ring while the branch list is open. The app sends a
 * mod no event when focus leaves the band, but the move is refused once it has.
 *
 * The list closes only if the band has held the keyboard since it opened, so one opened
 * from the prompt with /branches stays open until it has been used.
 *
 * @param deny why the move was refused; undefined when it went through
 * @param hasHeldKeys whether the band has held the keyboard since the list opened
 */
export function readFocusAnswer(
  deny: string | undefined,
  hasHeldKeys: boolean,
): { hasHeldKeys: boolean; shouldClose: boolean } {
  if (deny === undefined) {
    return { hasHeldKeys: true, shouldClose: false }
  }
  if (deny.includes(NOT_HOLDING_KEYS) && hasHeldKeys) {
    return { hasHeldKeys: false, shouldClose: true }
  }

  return { hasHeldKeys, shouldClose: false }
}
