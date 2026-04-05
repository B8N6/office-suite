import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMessages, getMessage, messageAction, searchMessages, getFolders } from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { groupByThread } from './groupByThread'
import { formatMsgDate } from '../../utils/dateFormat'
import { toast } from '../../hooks/useToast'
import type { Message } from '../../types'

export default function MessageList() {
  const [selectionMode, setSelectionMode] = useState(false)
  const {
    currentFolder,
    currentFolderLabel,
    currentPage,
    setPagination,
    setMessages,
    messages,
    selectedUids,
    toggleSelect,
    selectAll,
    clearSelected,
    setCurrentMessage,
    currentMessage,
  } = useMailStore()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 550)
    return () => clearTimeout(t)
  }, [search])

  // Keyboard shortcut: / focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const { data: msgData, isLoading } = useQuery({
    queryKey: ['messages', currentFolder, currentPage, debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch) {
        const res = await searchMessages(debouncedSearch, currentFolder)
        return res.data
      }
      const res = await getMessages(currentFolder, currentPage)
      return res.data
    },
    placeholderData: (prev) => prev,
  })

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => getFolders().then((r) => r.data),
  })

  const currentFolderObj = foldersData?.folders?.find((f: { name: string }) => f.name === currentFolder)
  const currentFolderIconClass = currentFolderObj?.icon || 'bi-inbox-fill'

  useEffect(() => {
    if (msgData) {
      setMessages(msgData.messages || [])
      setPagination(msgData.page || 1, msgData.totalPages || 1)
    }
  }, [msgData, setMessages, setPagination])

  // Clear selected & search on folder change
  useEffect(() => {
    clearSelected()
    setSearch('')
    setDebouncedSearch('')
    setExpandedThreads(new Set())
  }, [currentFolder, clearSelected])

  const actionMutation = useMutation({
    mutationFn: ({ action, uid, folder, target }: { action: string; uid: number; folder: string; target?: string }) =>
      messageAction(action, uid, folder, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', currentFolder] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
    onError: () => toast('Action failed', 'error'),
  })

  const bulkAction = useCallback(
    async (action: string, target?: string) => {
      const uids = selectedUids
      await Promise.all(uids.map((uid) => messageAction(action, uid, currentFolder, target)))
      clearSelected()
      queryClient.invalidateQueries({ queryKey: ['messages', currentFolder] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast(`${action} applied to ${uids.length} messages`, 'success')
    },
    [selectedUids, currentFolder, clearSelected, queryClient]
  )

  const openMessage = useCallback(
    async (msg: Message) => {
      try {
        const res = await getMessage(msg.uid, msg.folder || currentFolder)
        setCurrentMessage(res.data.message)
        if (!msg.seen) {
          actionMutation.mutate({ action: 'read', uid: msg.uid, folder: msg.folder || currentFolder })
        }
      } catch {
        toast('Failed to load message', 'error')
      }
    },
    [currentFolder, setCurrentMessage, actionMutation]
  )

  const threads = groupByThread(messages)

  const toggleThread = (key: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allUids = messages.map((m) => m.uid)
  const allSelected = allUids.length > 0 && allUids.every((uid) => selectedUids.includes(uid))

  const renderMsg = (msg: Message, indent = false) => {
    const isSelected = selectedUids.includes(msg.uid)
    const isCurrent = currentMessage?.uid === msg.uid

    return (
      <div
        key={`${msg.uid}-${msg.folder}`}
        className={`msg-item ${msg.seen ? '' : 'unread'} ${isSelected || isCurrent ? 'selected' : ''}`}
        style={indent ? { paddingLeft: 28 } : undefined}
        onClick={() => openMessage(msg)}
      >
        <div
          className={`msg-item-check ${isSelected ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleSelect(msg.uid)
          }}
        >
          {isSelected && <i className="bi bi-check" style={{ fontSize: 12 }} />}
        </div>

        <div className="msg-item-content">
          <div className="msg-from">{msg.from}</div>
          <div className="msg-subject">{msg.subject || '(no subject)'}</div>
          <div className="msg-preview">{msg.preview}</div>
        </div>

        <div className="msg-meta">
          <span className="msg-date">{formatMsgDate(msg.dateRaw || msg.date)}</span>
          <div className="msg-icons">
            {msg.flagged && <i className={`bi bi-star-fill flagged`} />}
            {msg.hasAttach && <i className={`bi bi-paperclip attach`} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`msg-list-pane ${(selectedUids.length > 0 || selectionMode) ? 'has-selection' : ''}`}>
      {/* Header */}
      <div className="msg-list-header">
        <div className="msg-list-title-row">
          <div className="msg-list-title">
            <i className={`bi ${currentFolderIconClass}`} style={{ marginRight: 8, fontSize: 16 }} />
            <span>{currentFolderLabel || currentFolder || 'Inbox'}</span>
            {messages.length > 0 && (
              <span className="msg-list-count">{messages.length}</span>
            )}
          </div>
          <button
            className={`icon-btn ${selectionMode ? 'active' : ''}`}
            title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            onClick={() => {
              if (selectionMode) clearSelected()
              setSelectionMode((v) => !v)
            }}
          >
            <i className={`bi ${selectionMode ? 'bi-check2-square' : 'bi-ui-checks'}`} />
          </button>
        </div>
        <div className="msg-search">
          <i className="bi bi-search" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search messages... (/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => { setSearch(''); setDebouncedSearch('') }} className="icon-btn" style={{ width: 20, height: 20, fontSize: 12 }}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedUids.length > 0 && (
        <div className="bulk-bar">
          <span style={{ fontSize: 12, color: 'var(--yl)', fontWeight: 700, marginRight: 4 }}>
            {selectedUids.length} selected
          </span>
          <button className="btn-ghost" onClick={() => bulkAction('read')}>
            <i className="bi bi-envelope-open" /> Read
          </button>
          <button className="btn-ghost" onClick={() => bulkAction('unread')}>
            <i className="bi bi-envelope" /> Unread
          </button>
          <button className="btn-ghost" onClick={() => bulkAction('flag')}>
            <i className="bi bi-star" /> Flag
          </button>
          <button className="btn-ghost" onClick={() => bulkAction('trash')}>
            <i className="bi bi-trash3" /> Trash
          </button>
          <button className="btn-ghost" onClick={() => bulkAction('spam')}>
            <i className="bi bi-shield-slash" /> Spam
          </button>
          <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => {
            if (confirm(`Permanently delete ${selectedUids.length} message${selectedUids.length > 1 ? 's' : ''}? This cannot be undone.`)) {
              bulkAction('delete')
            }
          }}>
            <i className="bi bi-x-circle" /> Delete
          </button>
          <div className="move-dropdown" style={{ marginLeft: 'auto' }}>
            <button className="btn-ghost" onClick={() => setShowMoveDropdown((v) => !v)}>
              <i className="bi bi-folder-symlink" /> Move
            </button>
            {showMoveDropdown && (
              <div className="move-dropdown-menu">
                {(foldersData?.folders || []).map((f) => (
                  <div
                    key={f.name}
                    className="move-dropdown-item"
                    onClick={() => {
                      bulkAction('move', f.name)
                      setShowMoveDropdown(false)
                    }}
                  >
                    <i className={`bi ${f.icon || 'bi-folder-fill'}`} />
                    {f.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={clearSelected} title="Clear selection">
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* Select all row — only shown in selection mode */}
      {messages.length > 0 && selectionMode && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            className={`msg-item-check ${allSelected ? 'checked' : ''}`}
            style={{ display: 'flex' }}
            onClick={() => (allSelected ? clearSelected() : selectAll(allUids))}
          >
            {allSelected && <i className="bi bi-check" style={{ fontSize: 12 }} />}
          </div>
        </div>
      )}

      {/* Message body */}
      <div className="msg-list-body" onClick={() => setShowMoveDropdown(false)}>
        {isLoading ? (
          <div className="loading-state">
            <span className="spinner" />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-inbox" />
            <p>{debouncedSearch ? 'No results found' : 'No messages'}</p>
          </div>
        ) : (
          threads.map((thread) => {
            if (thread.children.length === 0) {
              return renderMsg(thread.lead)
            }
            const isExpanded = expandedThreads.has(thread.key)
            return (
              <div className="thread-grp" key={thread.key}>
                {renderMsg(thread.lead)}
                <div
                  className="thread-toggle"
                  onClick={() => toggleThread(thread.key)}
                >
                  <i className={`bi bi-${isExpanded ? 'chevron-up' : 'chevron-down'}`} />
                  {isExpanded ? 'Collapse' : `${thread.children.length} more in thread`}
                </div>
                {isExpanded && (
                  <div className="thread-child">
                    {thread.children.map((m) => renderMsg(m, true))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {!isLoading && messages.length > 0 && (
        <PaginationBar />
      )}
    </div>
  )
}

function PaginationBar() {
  const { currentPage, totalPages } = useMailStore()

  const goTo = (page: number) => {
    useMailStore.setState({ currentPage: page })
  }

  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => goTo(currentPage - 1)}
      >
        <i className="bi bi-chevron-left" />
      </button>
      <span className="pagination-info">
        {currentPage} / {totalPages}
      </span>
      <button
        className="pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => goTo(currentPage + 1)}
      >
        <i className="bi bi-chevron-right" />
      </button>
    </div>
  )
}
