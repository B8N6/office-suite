import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCloudQuota, listCloudFiles, uploadCloudFile, deleteCloudFile,
  setCloudAccess, listSharedWithMe,
  cloudDownloadUrl, cloudSharedDownloadUrl, cloudPublicUrl,
  type CloudFile, type CloudAccessMode,
} from '../../api/client'
import { toast } from '../../hooks/useToast'
import { formatFileSize } from '../../utils/dateFormat'
import ShareModal from './ShareModal'

/**
 * Cloud storage pane — file manager for the user's private + shared files.
 * Rendered full-width when view === 'cloud'.
 */
export default function CloudPane() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [shareFile, setShareFile] = useState<CloudFile | null>(null)
  const [tab, setTab] = useState<'mine' | 'shared'>('mine')

  const { data: quota } = useQuery({
    queryKey: ['cloud-quota'],
    queryFn: () => getCloudQuota().then((r) => r.data),
  })
  const { data: filesData } = useQuery({
    queryKey: ['cloud-files'],
    queryFn: () => listCloudFiles().then((r) => r.data),
  })
  const { data: sharedData } = useQuery({
    queryKey: ['cloud-shared-with-me'],
    queryFn: () => listSharedWithMe().then((r) => r.data),
    refetchInterval: 60_000, // keep the tab badge fresh
  })
  const files = filesData?.files || []
  const sharedFiles = sharedData?.files || []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cloud-files'] })
    queryClient.invalidateQueries({ queryKey: ['cloud-quota'] })
  }

  const upload = async (file: File) => {
    if (quota && file.size > quota.maxFileSize) {
      toast(`File exceeds ${Math.round(quota.maxFileSize / 1024 / 1024)}MB per-file limit`, 'error')
      return
    }
    setUploading(true); setUploadPct(0)
    try {
      await uploadCloudFile(file, setUploadPct)
      toast(`Uploaded ${file.name}`, 'success')
      invalidate()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Upload failed', 'error')
    } finally {
      setUploading(false); setUploadPct(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCloudFile(id),
    onSuccess: () => { invalidate(); toast('File deleted', 'success') },
    onError: () => toast('Delete failed', 'error'),
  })

  const saveAccessMut = useMutation({
    mutationFn: ({ id, mode, emails }: { id: string; mode: CloudAccessMode; emails: string[] }) =>
      setCloudAccess(id, mode, emails).then((r) => r.data),
    onSuccess: (d) => {
      invalidate()
      if (d.file.accessMode === 'public' && d.shareUrl) {
        const fullUrl = window.location.origin + d.shareUrl
        navigator.clipboard?.writeText(fullUrl).catch(() => {})
        toast('Public link copied to clipboard', 'success')
      } else {
        toast(`Access updated: ${d.file.accessMode}`, 'success')
      }
      setShareFile(null)
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Failed to update access', 'error')
    },
  })

  const usedPct = quota && quota.storageLimit > 0
    ? Math.min(100, Math.round((quota.storageUsed / quota.storageLimit) * 100))
    : 0

  return (
    <div className="cloud-pane">
      <div className="cloud-header">
        <div className="cloud-title">
          <i className="bi bi-cloud-fill" style={{ marginRight: 10, color: 'var(--yl)' }} />
          CLOUD STORAGE
        </div>
        <button
          className="btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><span className="spinner" style={{ width: 12, height: 12 }} /> Uploading {uploadPct}%</>
          ) : (
            <><i className="bi bi-cloud-upload" /> Upload file</>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </div>

      {/* Quota bar */}
      {quota && (
        <div className="cloud-quota">
          <div className="cloud-quota-label">
            <span>{formatFileSize(quota.storageUsed)} / {formatFileSize(quota.storageLimit)} used</span>
            <span style={{ color: 'var(--dim)', fontSize: 11 }}>
              Max per file: {formatFileSize(quota.maxFileSize)}
            </span>
          </div>
          <div className="cloud-quota-bar">
            <div
              className="cloud-quota-fill"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 90 ? 'var(--red)' : usedPct > 70 ? '#fb923c' : 'var(--yl)',
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="cloud-tabs">
        <button
          className={`cloud-tab ${tab === 'mine' ? 'active' : ''}`}
          onClick={() => setTab('mine')}
        >
          <i className="bi bi-folder" /> My files ({files.length})
        </button>
        <button
          className={`cloud-tab ${tab === 'shared' ? 'active' : ''}`}
          onClick={() => setTab('shared')}
        >
          <i className="bi bi-share" /> Shared with me ({sharedFiles.length})
        </button>
      </div>

      {/* File list */}
      <div className="cloud-files">
        {tab === 'mine' ? (
          files.length === 0 ? (
            <div className="cloud-empty">
              <i className="bi bi-cloud" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>No files yet</p>
              <span style={{ fontSize: 12, color: 'var(--dim2)' }}>
                Upload a file to get started
              </span>
            </div>
          ) : (
            <table className="cloud-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 100 }}>Size</th>
                  <th style={{ width: 140 }}>Uploaded</th>
                  <th style={{ width: 110 }}>Access</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <i className={`bi ${iconFor(f.mimeType)}`} style={{ marginRight: 8, color: 'var(--dim)' }} />
                      <span style={{ color: 'var(--wh)', fontWeight: 500 }}>{f.name}</span>
                      {f.downloadCount > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 8, fontFamily: 'Share Tech Mono, monospace' }}>
                          · {f.downloadCount} dl
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>
                      {formatFileSize(f.size)}
                    </td>
                    <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                      {f.uploadedAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td>
                      <AccessBadge mode={f.accessMode} count={f.allowedEmails?.length || 0} />
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <a
                        href={cloudDownloadUrl(f.id)}
                        className="icon-btn"
                        title="Download"
                        download={f.name}
                      >
                        <i className="bi bi-download" />
                      </a>
                      <button
                        className="icon-btn"
                        title="Manage sharing"
                        onClick={() => setShareFile(f)}
                      >
                        <i className="bi bi-share" />
                      </button>
                      {f.accessMode === 'public' && f.shareToken && (
                        <button
                          className="icon-btn"
                          title="Copy public link"
                          onClick={() => {
                            navigator.clipboard?.writeText(window.location.origin + cloudPublicUrl(f.shareToken!))
                            toast('Link copied', 'success')
                          }}
                        >
                          <i className="bi bi-link-45deg" />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        title="Delete"
                        style={{ color: 'var(--red)' }}
                        onClick={() => {
                          if (confirm(`Delete "${f.name}"? This cannot be undone.`)) deleteMut.mutate(f.id)
                        }}
                      >
                        <i className="bi bi-trash3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          /* Shared with me tab */
          sharedFiles.length === 0 ? (
            <div className="cloud-empty">
              <i className="bi bi-share" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>Nothing shared with you yet</p>
            </div>
          ) : (
            <table className="cloud-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 180 }}>Shared by</th>
                  <th style={{ width: 100 }}>Size</th>
                  <th style={{ width: 140 }}>Uploaded</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sharedFiles.map((f) => (
                  <tr key={`${f.ownerEmail}-${f.id}`}>
                    <td>
                      <i className={`bi ${iconFor(f.mimeType)}`} style={{ marginRight: 8, color: 'var(--dim)' }} />
                      <span style={{ color: 'var(--wh)', fontWeight: 500 }}>{f.name}</span>
                    </td>
                    <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>
                      {f.ownerEmail}
                    </td>
                    <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>
                      {formatFileSize(f.size)}
                    </td>
                    <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                      {f.uploadedAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td>
                      <a
                        href={cloudSharedDownloadUrl(f.ownerEmail, f.id)}
                        className="icon-btn"
                        title="Download"
                        download={f.name}
                      >
                        <i className="bi bi-download" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Share access modal */}
      {shareFile && (
        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
          onSave={(mode, emails) => saveAccessMut.mutate({ id: shareFile.id, mode, emails })}
          saving={saveAccessMut.isPending}
        />
      )}
    </div>
  )
}

function AccessBadge({ mode, count }: { mode: CloudAccessMode; count: number }) {
  const label = mode === 'emails' ? `${count} EMAIL${count !== 1 ? 'S' : ''}`
             : mode === 'public' ? '● PUBLIC'
             : mode === 'domain' ? '● DOMAIN'
             : '○ PRIVATE'
  return <span className={`cloud-badge ${mode}`}>{label}</span>
}

// iconFor returns a bootstrap-icon class name for a given MIME type.
function iconFor(mime: string): string {
  if (mime.startsWith('image/')) return 'bi-file-image'
  if (mime.startsWith('video/')) return 'bi-file-play'
  if (mime.startsWith('audio/')) return 'bi-file-music'
  if (mime.includes('pdf')) return 'bi-file-pdf'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z')) return 'bi-file-zip'
  if (mime.includes('word') || mime.includes('document')) return 'bi-file-word'
  if (mime.includes('sheet') || mime.includes('excel')) return 'bi-file-excel'
  if (mime.startsWith('text/')) return 'bi-file-text'
  return 'bi-file-earmark'
}
