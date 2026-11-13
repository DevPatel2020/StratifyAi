import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Message, ThinkingPath } from '@shared/types'
import { PathCard } from '@renderer/components/ThinkingPanel'
import { Markdown } from '@renderer/components/Markdown'
import { activeChain } from '@renderer/lib/utils'
import { layoutTree } from '@renderer/pages/TreePage'

const path: ThinkingPath = {
  id: 'p1',
  name: 'Root Cause',
  framework: '5 Whys',
  rationale: 'Find the real cause',
  steps: ['Reproduce', 'Ask why', 'Fix it'],
  recommended: true,
  score: 0.9
}

describe('PathCard', () => {
  it('runs cumulative steps with the play button', () => {
    const onRun = vi.fn()
    render(<PathCard path={path} disabled={false} onRun={onRun} />)
    fireEvent.click(screen.getByTitle('Run steps 1–2'))
    expect(onRun).toHaveBeenCalledWith([1, 2])
  })

  it('runs an arbitrary subset of ticked steps', () => {
    const onRun = vi.fn()
    render(<PathCard path={path} disabled={false} onRun={onRun} />)
    fireEvent.click(screen.getByLabelText('Select step 3'))
    fireEvent.click(screen.getByLabelText('Select step 1'))
    fireEvent.click(screen.getByText(/Run selected steps/))
    expect(onRun).toHaveBeenCalledWith([3, 1])
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })
})

describe('Markdown', () => {
  it('never renders raw HTML from model output', () => {
    const { container } = render(<Markdown text={'**bold** <img src=x onerror="alert(1)"> <script>alert(1)</script>'} />)
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })
})

describe('thinking tree helpers', () => {
  const m = (id: string, parentId: string | null): Message => ({
    id,
    parentId,
    conversationId: 'c',
    role: 'user',
    content: id,
    meta: {},
    createdAt: 0
  })
  const msgs = [m('a', null), m('b', 'a'), m('c', 'a'), m('d', 'c')]

  it('computes the active branch', () => {
    expect(activeChain(msgs, 'd').map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })

  it('lays out a branching tree without overlaps', () => {
    const pos = layoutTree(msgs)
    expect(pos.get('b')!.y).toBe(pos.get('c')!.y)
    expect(pos.get('b')!.x).not.toBe(pos.get('c')!.x)
    expect(pos.get('a')!.x).toBe((pos.get('b')!.x + pos.get('c')!.x) / 2)
  })
})
