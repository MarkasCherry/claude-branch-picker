import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BranchRowProps, PullRequest, Repo } from '../types'
import { readFocusAnswer } from './click-away'

const GIT_POLL_MS = 5000
const PR_POLL_MS = 60000
const CLICK_AWAY_POLL_MS = 400
const MAX_ROWS = 8
const SEARCH_KEY = 'branch-search'

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const repoAtom = atom({ plugin: 'branch-picker', key: 'repo' } as const, null, {
  shape: 'repo-2',
})
const prsAtom = atom({ plugin: 'branch-picker', key: 'prs' } as const, {}, {
  shape: 'prs-1',
})
const isOpenAtom = atom({ plugin: 'branch-picker', key: 'isOpen' } as const, false)
const queryAtom = atom({ plugin: 'branch-picker', key: 'query' } as const, '')
const messageAtom = atom({ plugin: 'branch-picker', key: 'message' } as const, '')

/** Runs work nobody waits for; a look that fails is simply tried again at the next one. */
const inBackground = (work: Promise<void>): void => {
  work.catch(() => {})
}

const lines = (text: string): string[] => text.split('\n').filter(line => line.trim() !== '')

/** Asks git for the folder's branches and uncommitted changes. */
async function lookAtGit($: EngineInterface): Promise<Repo> {
  const cwd = await $.session.cwd()
  const home = await $.env.get('HOME')
  const folder = home !== undefined && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
  const nothing = { folder, current: '', branches: [], changedFiles: 0, untrackedFiles: 0 }

  const current = await $.process.run(['git', 'branch', '--show-current'])
  if (current.exitCode !== 0) {
    return { ...nothing, isRepo: false }
  }

  const branches = await $.process.run([
    'git',
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads',
  ])
  const status = lines((await $.process.run(['git', 'status', '--porcelain'])).stdout)
  const untrackedFiles = status.filter(line => line.startsWith('??')).length

  return {
    ...nothing,
    isRepo: true,
    current: current.stdout.trim(),
    branches: lines(branches.stdout).map(branch => branch.trim()),
    changedFiles: status.length - untrackedFiles,
    untrackedFiles,
  }
}

/** Refreshes what the band draws, redrawing only on a change. */
async function refreshGit($: EngineInterface): Promise<void> {
  const repo = await lookAtGit($)
  if (JSON.stringify(await read($, repoAtom)) !== JSON.stringify(repo)) {
    await update($, repoAtom, () => repo)
  }
}

/** Asks GitHub for each branch's newest PR; without `gh` there are simply no PR chips. */
async function refreshPrs($: EngineInterface): Promise<void> {
  const found: Record<string, PullRequest> = {}
  try {
    const ran = await $.process.run(
      ['gh', 'pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,state,isDraft,url,headRefName'],
      { timeoutMs: 20000 },
    )
    if (ran.exitCode !== 0) {
      return
    }
    const listed = JSON.parse(ran.stdout) as {
      number: number
      state: string
      isDraft: boolean
      url: string
      headRefName: string
    }[]
    // Newest first, so a branch's first PR in the list is the one to show.
    for (const pr of listed) {
      if (found[pr.headRefName] === undefined) {
        const state = pr.isDraft && pr.state === 'OPEN' ? 'draft' : pr.state.toLowerCase()
        found[pr.headRefName] = {
          number: pr.number,
          state: state as PullRequest['state'],
          url: pr.url,
        }
      }
    }
  } catch {
    return
  }
  if (JSON.stringify(await read($, prsAtom)) !== JSON.stringify(found)) {
    await update($, prsAtom, () => found)
  }
}

/** Closes the dropdown and forgets the search. */
async function closeDropdown($: EngineInterface): Promise<void> {
  await update($, isOpenAtom, () => false)
  await update($, queryAtom, () => '')
  await update($, messageAtom, () => '')
}

/** Opens or closes the dropdown; an opened one is up to date. */
async function toggleDropdown($: EngineInterface): Promise<boolean> {
  if (await read($, isOpenAtom)) {
    await closeDropdown($)

    return false
  }
  await update($, isOpenAtom, () => true)
  inBackground(refreshGit($))
  inBackground(refreshPrs($))

  return true
}

/** Switches branch, unless uncommitted changes would come along or be at risk. */
async function switchTo($: EngineInterface, branch: string): Promise<void> {
  const repo = await lookAtGit($)

  if (branch === repo.current) {
    await closeDropdown($)

    return
  }

  if (repo.changedFiles > 0) {
    const files = repo.changedFiles === 1 ? '1 file has' : `${repo.changedFiles} files have`
    await update($, messageAtom, () => `${files} uncommitted changes. Commit or stash them first.`)
    await refreshGit($)

    return
  }

  const ran = await $.process.run(['git', 'switch', branch])
  if (ran.exitCode === 0) {
    await closeDropdown($)
  } else {
    const reason = lines(ran.stderr).slice(0, 3).join(' ') || 'git gave no reason.'
    await update($, messageAtom, () => `Could not switch: ${reason}`)
  }
  await refreshGit($)
}

// The band's id, and whether it has held the keyboard since the list opened.
let bandId: string | undefined
let hasHeldKeys = false

/** Closes the list once focus has left the band, as a click elsewhere does. */
async function closeOnClickAway($: EngineInterface): Promise<void> {
  if (bandId === undefined || !(await read($, isOpenAtom))) {
    hasHeldKeys = false

    return
  }

  let deny: string | undefined
  try {
    deny = (await $.ui.focus({ requestId: bandId, key: SEARCH_KEY })).deny
  } catch (error) {
    deny = String(error)
  }

  const answer = readFocusAnswer(deny, hasHeldKeys)
  hasHeldKeys = answer.hasHeldKeys
  if (answer.shouldClose) {
    await closeDropdown($)
  }
}

const PR_COLORS = { open: 'success', draft: 'subtle', merged: 'merged', closed: 'error' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branches',
      description: 'Open or close the branch search above the prompt',
    })
    $.ui.status(undefined)
    await refreshGit($)
    $.clock.after(0, () => inBackground(refreshPrs($)))
    // Catches a switch made anywhere else, such as a terminal.
    $.clock.every(GIT_POLL_MS, () => inBackground(refreshGit($)))
    $.clock.every(PR_POLL_MS, () => inBackground(refreshPrs($)))
    $.clock.every(CLICK_AWAY_POLL_MS, () => inBackground(closeOnClickAway($)))

    return next(e)
  })

  on('command.run', { command: 'branches' }, async $ => {
    const isOpen = await toggleDropdown($)

    return { text: isOpen ? 'Branch search opened.' : 'Branch search closed.' }
  })

  on('turn.complete', async ($, e, next) => {
    await refreshGit($)

    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const repo = await read($, repoAtom)
    const branch = (e.data as { branch?: unknown } | null)?.branch
    if (typeof branch === 'string' && repo?.branches.includes(branch) === true) {
      await switchTo($, branch)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    bandId = e.requestId
    const repo = await read($, repoAtom)
    if (e.props.hasSurvey || repo === null || !repo.isRepo) {
      return next(e)
    }

    const elements = $.ui.resolve(e)
    const { Box, Button, Input, Link, Text } = elements
    const Client = 'Client' in elements ? elements.Client : undefined
    const prs = await read($, prsAtom)
    const isOpen = await read($, isOpenAtom)
    const query = await read($, queryAtom)
    const message = await read($, messageAtom)

    const needle = query.trim().toLowerCase()
    const matches = [repo.current, ...repo.branches.filter(branch => branch !== repo.current)]
      .filter(branch => branch !== '' && branch.toLowerCase().includes(needle))
    const firstOther = matches.find(branch => branch !== repo.current)
    const pr = prs[repo.current]
    const changes = repo.changedFiles + repo.untrackedFiles
    const isDesktop = e.surface === 'desktop'
    const chip =
      isDesktop
        ? ({ borderStyle: 'single', borderColor: 'promptBorder', paddingX: 1, paddingY: 0, alignItems: 'center' } as const)
        : ({ paddingX: 1 } as const)

    return (
      <Box flexDirection="column">
        {isOpen && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="promptBorder"
            paddingX={1}
            paddingY={isDesktop ? 'sm' : 0}
            rowGap={isDesktop ? 'sm' : 0}
            marginBottom={1}
          >
            <Input
              key={SEARCH_KEY}
              placeholder="Search branches…"
              value={query}
              submitLabel="switch"
              autoFocus
              onInput={value => {
                inBackground(update($, queryAtom, () => value))
                inBackground(update($, messageAtom, () => ''))
              }}
              onSubmit={() => (firstOther === undefined ? undefined : switchTo($, firstOther))}
            />
            {matches.length === 0 && <Text dimColor>No matching branches.</Text>}
            {matches.slice(0, MAX_ROWS).map(branch => {
              const rowPr = prs[branch]
              const isCurrent = branch === repo.current
              const prText = rowPr === undefined ? '' : `#${rowPr.number} ${rowPr.state}`

              if (Client !== undefined && isDesktop) {
                const row: BranchRowProps = { branch, isCurrent, pr: prText }

                return (
                  <Client key={`row:${branch}`} module="./branch-row.tsx" props={row} width="100%" />
                )
              }

              return (
                <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
                  <Button key={`branch:${branch}`} plain onPress={() => switchTo($, branch)}>
                    <Text color={isCurrent ? 'suggestion' : undefined} bold={isCurrent}>
                      {isCurrent ? '✓ ' : '  '}
                      {branch}
                    </Text>
                  </Button>
                  {prText !== '' && <Text dimColor>{prText}</Text>}
                </Box>
              )
            })}
            {matches.length > MAX_ROWS && (
              <Text dimColor>{matches.length - MAX_ROWS} more, type to narrow</Text>
            )}
            {message !== '' && <Text color="warning">{message}</Text>}
            {e.props.isWorking && (
              <Text dimColor>Claude is working: switching changes the files it is using.</Text>
            )}
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" alignItems="stretch" columnGap={1}>
          <Box {...chip} flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-start">
              {repo.folder}
            </Text>
          </Box>
          <Button
            key="branch-chip"
            onPress={async press => {
              if (await toggleDropdown($)) {
                // Typing needs one more click if the ring cannot move here.
                await $.ui.focus({ requestId: press.requestId, key: SEARCH_KEY }).catch(() => {})
              }
            }}
          >
            <Text color="success">
              ⎇ {repo.current || 'detached HEAD'} {isOpen ? '▴' : '▾'}
            </Text>
          </Button>
          <Box {...chip}>
            <Text color={changes > 0 ? 'warning' : undefined} dimColor={changes === 0}>
              ± {changes}
            </Text>
          </Box>
          {pr !== undefined && (
            <Box {...chip} flexDirection="row" columnGap={1}>
              <Link href={pr.url} label={`PR #${pr.number}`} />
              <Text color={PR_COLORS[pr.state]}>{pr.state}</Text>
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
