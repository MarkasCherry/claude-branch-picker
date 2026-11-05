import { expect, test } from 'claude-code/testing'

import { readFocusAnswer } from './click-away'

const BAND = (surface: 'desktop' | 'terminal') =>
  ({
    plugin: 'branch-picker',
    component: 'AbovePrompt',
    requestId: 'band',
    surface,
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 20 },
    },
  }) as const

const PRS = JSON.stringify([
  { number: 2, state: 'OPEN', isDraft: false, url: 'https://x/2', headRefName: 'feature' },
  { number: 1, state: 'MERGED', isDraft: false, url: 'https://x/1', headRefName: 'main' },
])

type Git = {
  current: string
  status: string
  switchFails?: boolean
  ghFails?: boolean
  notRepo?: boolean
}

/** A pretend git and gh: answers the mod's commands and records each `git switch`. */
function fakeGit(on: any, state: Git) {
  const switched: string[] = []
  on('command.register', () => ({ value: { command: 'branches' } }))
  on('ui.status', () => ({ value: undefined }))
  // A refused period ends the timer: the tests call for no polling.
  on('clock.every', () => ({ deny: 'no polling in tests' }))
  // Answering runs the timer's work at once: the first PR look.
  on('clock.after', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/home/me/proj' }))
  on('env.get', () => ({ value: '/home/me' }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    const done = (stdout: string, exitCode = 0, stderr = '') => ({
      value: { exitCode, stdout, stderr },
    })
    if (e.argv[0] === 'gh') return state.ghFails ? done('', 1, 'not logged in') : done(PRS)
    if (state.notRepo) return done('', 128, 'not a git repository')
    const command = e.argv[1]
    if (command === 'branch') return done(`${state.current}\n`)
    if (command === 'for-each-ref') return done('main\nfeature\nold\n')
    if (command === 'status') return done(state.status)
    if (state.switchFails) return done('', 1, 'fatal: already used by worktree')
    switched.push(String(e.argv[2]))
    state.current = String(e.argv[2])
    return done('')
  })
  return switched
}

/** Clicks a branch the way each surface offers it: a line on the desktop, a Button elsewhere. */
async function pick(ui: any, surface: 'desktop' | 'terminal', branch: string) {
  if (surface === 'desktop') {
    await ui.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: `row:${branch}` })
  } else {
    await ui.press({ key: `branch:${branch}` })
  }
}

const row = (surface: 'desktop' | 'terminal', branch: string) =>
  surface === 'desktop' ? `row:${branch}` : `branch:${branch}`

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: the chips show folder, branch and changes`, async ($, on) => {
    fakeGit(on, { current: 'main', status: ' M a.gd\n?? b.gd\n' })
    await $.session.start(start)
    const ui = await $.ui.mount(BAND(surface))

    expect(await ui.find({ type: 'Text', text: /~\/proj/ })).toBeTruthy()
    expect(await ui.find({ key: 'branch-chip' })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /±/ }))?.text).toBe('± 2')
    // The dropdown stays shut until the chip is pressed.
    expect(await ui.find({ key: row(surface, 'feature') })).toBeFalsy()
    await ui.unmount()
  })

  test(`${surface}: pressing the chip lists branches, and a row switches`, async ($, on) => {
    const switched = fakeGit(on, { current: 'main', status: '' })
    await $.session.start(start)
    const ui = await $.ui.mount(BAND(surface))

    await ui.press({ key: 'branch-chip' })
    expect(await ui.find({ key: row(surface, 'feature') })).toBeTruthy()
    await pick(ui, surface, 'feature')

    expect(switched).toEqual(['feature'])
    // A finished switch closes the dropdown.
    expect(await ui.find({ key: row(surface, 'old') })).toBeFalsy()
    await ui.unmount()
  })
}

test('typing narrows the list, and Enter switches to the top match', async ($, on) => {
  const switched = fakeGit(on, { current: 'main', status: '' })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })
  await ui.input({ key: 'branch-search', text: 'FEA', kind: 'change' })
  expect(await ui.find({ key: 'row:feature' })).toBeTruthy()
  expect(await ui.find({ key: 'row:old' })).toBeFalsy()

  await ui.input({ key: 'branch-search', text: 'FEA', kind: 'submit' })
  expect(switched).toEqual(['feature'])
  await ui.unmount()
})

test('uncommitted changes stop the switch and say why', async ($, on) => {
  const switched = fakeGit(on, { current: 'main', status: ' M a.gd\n M b.gd\n' })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })
  await pick(ui, 'desktop', 'feature')

  expect(switched).toEqual([])
  expect((await ui.find({ type: 'Text', text: /uncommitted/ }))?.text).toContain('2 files')
  await ui.unmount()
})

test('a line ignores a post naming no known branch', async ($, on) => {
  const switched = fakeGit(on, { current: 'main', status: '' })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })
  await ui.post({ branch: '--detach' }, { in: 'row:feature' })

  expect(switched).toEqual([])
  await ui.unmount()
})

test('clicking away closes the list, but only once the band had the keyboard', () => {
  const away = 'that site does not hold the keyboard'

  // Opened from the prompt, with the keyboard elsewhere: it stays open.
  expect(readFocusAnswer(away, false)).toEqual({ hasHeldKeys: false, shouldClose: false })
  // The band takes the keyboard.
  expect(readFocusAnswer(undefined, false)).toEqual({ hasHeldKeys: true, shouldClose: false })
  // A refusal for any other reason changes nothing.
  expect(readFocusAnswer('another move came first', true)).toEqual({
    hasHeldKeys: true,
    shouldClose: false,
  })
  // The keyboard has left: close.
  expect(readFocusAnswer(away, true)).toEqual({ hasHeldKeys: false, shouldClose: true })
})

test('a switch git refuses shows git’s reason', async ($, on) => {
  fakeGit(on, { current: 'main', status: '', switchFails: true })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })
  await pick(ui, 'desktop', 'feature')

  expect((await ui.find({ type: 'Text', text: /Could not switch/ }))?.text).toContain('worktree')
  await ui.unmount()
})

test('the chip and the rows show each branch\'s PR', async ($, on) => {
  fakeGit(on, { current: 'main', status: '' })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })

  // The PR look runs beside the drawing, so give it a moment.
  let chip
  for (let tries = 0; tries < 50 && chip === undefined; tries += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    chip = await ui.find({ type: 'Text', text: /^merged$/ })
  }
  expect(chip).toBeTruthy()
  expect(await ui.find({ key: 'row:feature' })).toBeTruthy()
  await ui.unmount()
})

test('without gh the band still draws, with no PR chip', async ($, on) => {
  fakeGit(on, { current: 'main', status: '', ghFails: true })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  await ui.press({ key: 'branch-chip' })

  expect(await ui.find({ key: 'row:feature' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /merged/ })).toBeFalsy()
  await ui.unmount()
})

test('outside a git repository the band draws nothing of its own', async ($, on) => {
  fakeGit(on, { current: 'main', status: '', notRepo: true })
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await $.session.start(start)
  const ui = await $.ui.mount(BAND('desktop'))

  expect(await ui.find({ key: 'branch-chip' })).toBeFalsy()
  await ui.unmount()
})
