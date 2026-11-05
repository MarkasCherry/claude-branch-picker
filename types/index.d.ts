/** What git said about the session's folder at the last look. */
export type Repo = {
  isRepo: boolean
  /** The session's folder, with the home directory written as `~`. */
  folder: string
  /** The checked-out branch; empty on a detached HEAD. */
  current: string
  /** Local branches, most recently committed first. */
  branches: string[]
  /** Tracked files with uncommitted changes. */
  changedFiles: number
  /** New files git does not track yet. */
  untrackedFiles: number
}

/** The newest pull request of one branch, as GitHub reports it. */
export type PullRequest = {
  number: number
  state: 'open' | 'draft' | 'merged' | 'closed'
  url: string
}

/** What one line of the desktop branch list draws. */
export type BranchRowProps = {
  branch: string
  isCurrent: boolean
  /** The branch's PR as text, such as `#2 open`; empty without one. */
  pr: string
}

declare module 'claude-code' {
  interface PluginState {
    'branch-picker': {
      repo: Shaped<Repo | null>
      prs: Shaped<Record<string, PullRequest>>
      isOpen: boolean
      query: string
      message: string
    }
  }
}
