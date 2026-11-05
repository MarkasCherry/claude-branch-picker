# Branch Picker for Claude Code

See and switch your git branch right above the Claude Code prompt, without leaving the chat or typing a git command.

Branch Picker adds a small row of chips above the prompt:

```
~/projects/my-app   ⎇ feature/login ▾   ± 3   PR #12 open
```

Click the branch chip to open a searchable list of your branches. Type a few letters, press Enter, and you're on that branch.

## What it does

- **Shows where you are:** your folder, current branch and number of changed files, always in view.
- **Switches branches fast:** search as you type, then press Enter for the top match or click anywhere on a branch's line. Your current branch is marked with a ✓, and the rest are sorted by most recent commit. Click away and the list closes.
- **Shows pull requests:** the chip shows the current branch's PR and its state (open, draft, merged or closed) and links to it on GitHub. Each branch in the list shows its PR too.
- **Protects your work:** if tracked files have uncommitted changes, it stays on your branch and asks you to commit or stash first. If git refuses a switch, you see git's reason.
- **Warns you mid-task:** if Claude is working, the list reminds you that switching changes the files it's using.
- **Stays up to date:** a switch you make in a terminal shows up within a few seconds.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install branch-picker --marketplace MarkasCherry/claude-branch-picker
```

Answer `y` to add the marketplace, then choose a scope.

Or from a shell:

```bash
claude plugin install branch-picker --marketplace MarkasCherry/claude-branch-picker
```

The chip row appears in your next session, in any folder that's a git repository.

## Requirements

- Claude Code, in the terminal or the desktop app.
- `git`.
- Optional: the [GitHub CLI](https://cli.github.com/) (`gh`), signed in, for the PR information. Without it, everything else still works and the PR chip stays hidden.

## Usage

| To do this | Do this |
| --- | --- |
| Open or close the branch list | Click the branch chip, or run `/branches` |
| Close the branch list | Click anywhere outside it |
| Filter the list | Type in the search box |
| Switch to the top match | Press Enter |
| Switch to any branch | Click it |
| Open the current PR | Click the PR chip |

## Good to know

- In the desktop app, the chip row appears after you send a new chat's first message.
- In the desktop app, use the search box and Enter from the keyboard. Tab doesn't move through the branch lines.
- It lists local branches only. To work on a remote branch, check it out once with git.
- The list shows up to 8 branches at a time. Type to narrow it down if you have more.
- Untracked files don't block a switch, because they stay in place. Git still refuses a switch that would overwrite one.
- Git is checked every 5 seconds and after each Claude turn. GitHub is checked every minute and whenever you open the list.
- It's built on Claude Code's plugin API, which is in early access and may change between releases.

## Development

```bash
claude plugin validate .
claude plugin test .
```

## License

[MIT](LICENSE)
