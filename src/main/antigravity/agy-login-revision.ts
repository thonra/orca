// Which of agy's logins a chat's `agy acp` on this host started with. Saved accounts swap one login
// inside one home, so the home can't tell; Orca counts the logins it puts there instead.

type LoginChangedListener = (committed: () => boolean) => void

export class AgyLoginRevision {
  private revision = 0
  private switchId = 0
  private switching = false
  private recheckOwed = false
  private readonly listeners = new Set<LoginChangedListener>()

  /** What a start records: the login agy holds now. */
  readonly atLaunch = (): string => String(this.revision)

  /** What a running child should match. During a switch none does, so each stops once its turn
   *  allows and its next start waits for the new login. */
  readonly current = (): string =>
    this.switching ? `switching:${this.switchId}` : String(this.revision)

  /** Orca put another login in agy's place (a switch, a sign-in). Listeners hear it with
   *  `committed`, false while a switch runs (whose end tells them again) or once a later login
   *  replaced this one. */
  changed(): void {
    this.revision += 1
    this.notify()
  }

  /** Every running child counts as on another account until `end`. `committed` holds while this
   *  switch is the one running. */
  beginSwitch(): { committed: () => boolean; end: () => void } {
    const id = ++this.switchId
    this.switching = true
    return {
      committed: () => this.switching && this.switchId === id,
      end: () => {
        if (this.switchId !== id || !this.switching) {
          return
        }
        this.switching = false
        if (this.recheckOwed) {
          this.notify()
        }
      }
    }
  }

  onChanged(listener: LoginChangedListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.recheckOwed = false
    const revision = this.revision
    const committed = (): boolean => {
      if (this.switching) {
        this.recheckOwed = true
        return false
      }
      return this.revision === revision
    }
    for (const listener of this.listeners) {
      try {
        listener(committed)
      } catch (error) {
        console.warn("[antigravity] a listener for agy's login failed:", error)
      }
    }
  }
}

/** The host's own agy login, which chats on agy's home and on Orca's homes share. */
export const AGY_HOST_LOGIN = new AgyLoginRevision()
