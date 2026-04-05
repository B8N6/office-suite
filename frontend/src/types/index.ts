export interface Message {
  uid: number
  subject: string
  from: string
  to: string
  cc: string
  date: string
  dateRaw: string
  seen: boolean
  flagged: boolean
  hasAttach: boolean
  preview: string
  messageId: string
  inReplyTo: string
  references: string
  threadKey: string
  folder: string
  accountEmail?: string
  readOnly?: boolean // true when opened from Unified Inbox for a non-active account
}

export interface MessageDetail extends Message {
  htmlBody: string
  textBody: string
  attachments: Attachment[]
  dateFull: string
}

export interface Attachment {
  part: string
  name: string
  mimeType: string
  size: number
}

export interface Folder {
  name: string
  label: string
  icon: string
  unread: number
  sort: number
}

export interface FilterRule {
  id: string
  name: string
  enabled: boolean
  logic: 'all' | 'any'
  conditions: FilterCondition[]
  actions: FilterAction[]
  created: string
  updated: string
}

export interface FilterCondition {
  field: 'from' | 'to' | 'subject'
  op: 'contains' | 'equals' | 'startsWith' | 'endsWith'
  value: string
}

export interface FilterAction {
  type: 'read' | 'star' | 'move' | 'delete'
  target?: string
}

export interface CalendarEvent {
  id: string
  title: string
  description: string
  start: string
  end: string
  allDay: boolean
  color: string
  location: string
  readonly?: boolean
  ownerEmail?: string
}

export interface ScheduledJob {
  id: string
  user: string
  to: string
  subject: string
  scheduledAt: string
  status: string
}

export interface Signature {
  html: string
  enabled: boolean
  name: string
}

export interface Domain {
  id: string
  domain: string
  imap_host: string
  imap_port: number
  imap_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_ssl: boolean
  active: boolean
  notes: string
  icon?: string
  iconLight?: string
  colorPrimary?: string
  colorPrimaryDim?: string
  colorBackground?: string
  colorText?: string
  colorAccent?: string
  colorPrimaryLight?: string
  colorPrimaryDimLight?: string
  colorBackgroundLight?: string
  colorTextLight?: string
  colorAccentLight?: string
}

export interface Account {
  email: string
  password: string
  name: string
  icon?: string       // dark-mode domain icon
  iconLight?: string  // light-mode domain icon
}

export interface PollResponse {
  newCount: number
  lastUid: number
  messages?: Message[]
}

export interface MessagesResponse {
  messages: Message[]
  page: number
  totalPages: number
  total: number
}

export interface MessageResponse {
  message: MessageDetail
}
