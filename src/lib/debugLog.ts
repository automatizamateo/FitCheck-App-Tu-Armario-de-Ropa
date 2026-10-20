// A small on-device log that survives iOS killing the page. localStorage is written synchronously and
// kept by a WebKit process that is not the one killed for using too much memory, so the last line
// before a crash is still there on the next launch (Settings → Advanced → Debug log).

const KEY = 'fitcheck-debug-log'
export const MAX_LOG_ENTRIES = 400

export interface LogEntry {
  t: number // epoch ms
  m: string
}

export function readDebugLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : []
  } catch {
    return []
  }
}

/** Appends one line, keeping only the newest MAX_LOG_ENTRIES. Never throws. */
export function debugLog(message: string, data?: Record<string, unknown>) {
  const m = data ? `${message} ${JSON.stringify(data)}` : message
  try {
    const entries = readDebugLog()
    entries.push({ t: Date.now(), m })
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)))
  } catch {
    /* storage unavailable or full: logging is best-effort */
  }
}

export function clearDebugLog() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** One line per entry: local date and time with milliseconds, then the message. */
export function formatDebugLog(entries: LogEntry[]): string {
  return entries
    .map(({ t, m }) => {
      const d = new Date(t)
      const pad = (n: number, w = 2) => String(n).padStart(w, '0')
      const stamp = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
      return `${stamp} ${m}`
    })
    .join('\n')
}
