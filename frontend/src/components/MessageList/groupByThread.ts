import type { Message } from '../../types'

export interface ThreadGroup {
  key: string
  lead: Message
  children: Message[]
  expanded: boolean
}

export function groupByThread(messages: Message[]): ThreadGroup[] {
  const groups = new Map<string, Message[]>()
  const order: string[] = []

  for (const msg of messages) {
    const key = msg.threadKey || String(msg.uid)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(msg)
  }

  return order.map((key) => {
    const msgs = groups.get(key)!
    // Sort by date ascending within thread
    msgs.sort((a, b) => new Date(a.dateRaw).getTime() - new Date(b.dateRaw).getTime())
    const [lead, ...children] = msgs
    return { key, lead, children, expanded: false }
  })
}
