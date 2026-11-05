import type { ClientModule } from 'claude-code'

import type { BranchRowProps } from '../types'

type RowState = { isHovered: boolean }

/**
 * One line of the branch list on the desktop app, where a Button can only be as
 * wide as its text: the whole line lights up under the pointer and takes the click.
 */
const BranchRow: ClientModule<BranchRowProps, RowState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const isHovered = surface.state?.isHovered === true

  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'leave') {
      const next = event.type === 'enter'
      if (next !== isHovered) {
        surface.setState({ isHovered: next })
      }
    }

    // A size of 0 means the surface has not measured the line yet: only an edge it knows counts.
    const isInside =
      event.x >= 0 &&
      event.y >= 0 &&
      (surface.columns === 0 || event.x < surface.columns) &&
      (surface.rows === 0 || event.y < surface.rows)
    if (event.type === 'up' && event.button === 'left' && isInside) {
      surface.post({ branch: props.branch })
    }
  })

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      columnGap={2}
      paddingX={1}
      backgroundColor={isHovered ? '#80808033' : undefined}
    >
      <Text color={props.isCurrent ? 'suggestion' : undefined} bold={props.isCurrent}>
        {props.isCurrent ? '✓ ' : '  '}
        {props.branch}
      </Text>
      {props.pr !== '' && <Text dimColor>{props.pr}</Text>}
    </Box>
  )
}

export default BranchRow
