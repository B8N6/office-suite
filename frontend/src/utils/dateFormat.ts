import { format, isToday, isThisYear, parseISO } from 'date-fns'

export function formatMsgDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = parseISO(dateStr)
    if (isToday(date)) return format(date, 'HH:mm')
    if (isThisYear(date)) return format(date, 'MMM d')
    return format(date, 'MMM d yyyy')
  } catch {
    return dateStr
  }
}

export function formatFullDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = parseISO(dateStr)
    return format(date, 'EEEE, MMMM d, yyyy HH:mm')
  } catch {
    return dateStr
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
