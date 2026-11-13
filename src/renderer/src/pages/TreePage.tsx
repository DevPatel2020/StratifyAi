import { useMemo } from 'react'
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNavigate } from 'react-router-dom'
import type { Message } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { activeChain } from '@renderer/lib/utils'
import { PageHeader } from '@renderer/components/ui'

const NODE_W = 230
const NODE_H = 90
const GAP_X = 40
const GAP_Y = 70

/** Simple tidy-tree layout: leaves get consecutive x slots, parents are centred over their children. */
export function layoutTree(messages: Message[]): Map<string, { x: number; y: number }> {
  const children = new Map<string | null, Message[]>()
  for (const m of messages) {
    const key = m.parentId && messages.some((x) => x.id === m.parentId) ? m.parentId : null
    children.set(key, [...(children.get(key) ?? []), m])
  }
  const pos = new Map<string, { x: number; y: number }>()
  let nextSlot = 0
  const place = (m: Message, depth: number): number => {
    const kids = children.get(m.id) ?? []
    let x: number
    if (kids.length === 0) x = nextSlot++
    else {
      const xs = kids.map((k) => place(k, depth + 1))
      x = (xs[0] + xs[xs.length - 1]) / 2
    }
    pos.set(m.id, { x: x * (NODE_W + GAP_X), y: depth * (NODE_H + GAP_Y) })
    return x
  }
  for (const root of children.get(null) ?? []) place(root, 0)
  return pos
}

export function TreePage() {
  const { detail, setHead } = useApp()
  const navigate = useNavigate()

  const { nodes, edges } = useMemo(() => {
    if (!detail) return { nodes: [] as Node[], edges: [] as Edge[] }
    const active = new Set(activeChain(detail.messages, detail.conversation.headId).map((m) => m.id))
    const pos = layoutTree(detail.messages)
    const nodes: Node[] = detail.messages.map((m) => {
      const isHead = m.id === detail.conversation.headId
      const label =
        m.role === 'user'
          ? `❓ ${m.content.slice(0, 90)}`
          : m.meta.kind === 'csv'
            ? '📊 Dataset analysis'
            : `🧠 ${m.meta.pathName ?? 'Answer'} · steps ${m.meta.steps?.join(',') ?? ''}`
      return {
        id: m.id,
        position: pos.get(m.id) ?? { x: 0, y: 0 },
        data: { label },
        style: {
          width: NODE_W,
          fontSize: 11,
          borderRadius: 10,
          padding: 8,
          textAlign: 'left',
          background: m.role === 'user' ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: isHead ? '2px solid hsl(var(--primary))' : active.has(m.id) ? '1px solid hsl(var(--primary) / 0.6)' : '1px solid hsl(var(--border))',
          opacity: active.has(m.id) ? 1 : 0.7
        }
      }
    })
    const edges: Edge[] = detail.messages
      .filter((m) => m.parentId && pos.has(m.parentId))
      .map((m) => ({
        id: `${m.parentId}-${m.id}`,
        source: m.parentId!,
        target: m.id,
        animated: active.has(m.id),
        style: { stroke: active.has(m.id) ? 'hsl(var(--primary))' : 'hsl(var(--border))' }
      }))
    return { nodes, edges }
  }, [detail])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Thinking Tree"
        description="Every question, path and answer as a branching tree (Tree-of-Thoughts). Click a node to continue reasoning from it."
      />
      <div className="flex-1">
        {!detail ? (
          <p className="p-6 text-sm text-muted-foreground">Open a conversation to see its thinking tree.</p>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
            nodesDraggable={false}
            onNodeClick={(_, node) => {
              void setHead(node.id)
              navigate('/')
            }}
            proOptions={{ hideAttribution: true }}
            colorMode={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          >
            <Background />
            <MiniMap pannable zoomable nodeColor={() => 'var(--series-1)'} maskColor="hsl(var(--background) / 0.6)" />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
