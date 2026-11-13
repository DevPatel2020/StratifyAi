import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpenCheck,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  LayoutTemplate,
  MessageSquare,
  Plus,
  Settings,
  Trash2
} from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { cn, timeAgo } from '@renderer/lib/utils'
import { Button } from './ui'

const NAV = [
  { to: '/', label: 'Chat', icon: MessageSquare, end: true },
  { to: '/tree', label: 'Thinking Tree', icon: GitBranch },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/templates', label: 'Frameworks', icon: LayoutTemplate },
  { to: '/lab', label: 'Model Lab', icon: FlaskConical },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/evaluation', label: 'Evaluation', icon: BookOpenCheck },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function Sidebar() {
  const conversations = useApp((s) => s.conversations)
  const activeId = useApp((s) => s.activeId)
  const open = useApp((s) => s.open)
  const remove = useApp((s) => s.removeConversation)
  const navigate = useNavigate()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card/40">
      <div className="p-3">
        <Button
          className="w-full"
          onClick={() => {
            void open(null)
            navigate('/')
          }}
        >
          <Plus size={16} /> New chat
        </Button>
      </div>
      <nav className="space-y-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                isActive && 'bg-accent text-accent-foreground'
              )
            }
          >
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet.</p>}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted',
              c.id === activeId && 'bg-muted'
            )}
            onClick={() => {
              void open(c.id)
              navigate('/')
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{c.title}</div>
              <div className="text-[10px] text-muted-foreground">{timeAgo(c.updatedAt)}</div>
            </div>
            <button
              aria-label="Delete conversation"
              className="hidden text-muted-foreground hover:text-destructive group-hover:block"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete "${c.title}"?`)) void remove(c.id)
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
