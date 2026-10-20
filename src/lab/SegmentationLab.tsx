import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { ChevronLeftIcon } from '../components/Icons'
import { loadImageFile } from '../lib/image'
import { CLOTHES_LABELS, LABEL_COLORS, SEGMENTATION_MODELS, type Device, type Dtype } from '../ml/models'
import { SegmentationClient, type LoadResult, type SegmentResult } from '../ml/segmentationClient'
import { CachePanel } from './CachePanel'
import { clearInFlight, markInFlight, readLeftoverMarker } from './crashMarker'
import { MaskCanvas, type OverlayMode } from './MaskCanvas'

const WORKING_MAX_SIDE = 1200 // matches the stored image size in SPEC §7
const DTYPES: readonly Dtype[] = ['q8', 'fp16', 'fp32']
const DEVICES: readonly Device[] = ['auto', 'webgpu', 'wasm']

interface PhotoInfo {
  bitmap: ImageBitmap
  originalWidth: number
  originalHeight: number
  decodeMs: number
}

interface RunRecord {
  n: number
  timings: SegmentResult['timings']
  total: number
}

const leftover = readLeftoverMarker()

export function SegmentationLab() {
  const navigate = useNavigate()
  const client = useRef<SegmentationClient | null>(null)
  const [modelId, setModelId] = useState(SEGMENTATION_MODELS[0]?.id ?? '')
  const [device, setDevice] = useState<Device>('auto')
  const [dtype, setDtype] = useState<Dtype>('q8')
  const [maskSide, setMaskSide] = useState(512)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [loaded, setLoaded] = useState<(LoadResult & { modelId: string }) | null>(null)
  const [photo, setPhoto] = useState<PhotoInfo | null>(null)
  const [result, setResult] = useState<SegmentResult | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [mode, setMode] = useState<OverlayMode>('classes')
  const [error, setError] = useState<string | null>(null)
  const [cacheKey, setCacheKey] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      client.current?.terminate()
    }
  }, [])

  const getClient = () => {
    client.current ??= new SegmentationClient()
    client.current.onProgress = (l, t) => {
      setProgress({ loaded: l, total: t })
    }
    return client.current
  }

  const guard = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    markInFlight(label)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      clearInFlight()
      setBusy(null)
      setProgress(null)
    }
  }

  const loadModel = () =>
    guard(`Loading ${modelId} (${device}, ${dtype})`, async () => {
      setLoaded(null)
      setRuns([])
      const res = await getClient().load(modelId, device, dtype)
      setLoaded({ ...res, modelId })
      setCacheKey((k) => k + 1)
    })

  const unload = () => {
    client.current?.terminate()
    client.current = null
    setLoaded(null)
    setRuns([])
  }

  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    void guard('Decoding photo', async () => {
      const t = performance.now()
      const img = await loadImageFile(file, WORKING_MAX_SIDE)
      photo?.bitmap.close()
      setPhoto({ ...img, decodeMs: performance.now() - t })
      setResult(null)
    })
  }

  const segment = (times: number) =>
    guard(`Segmenting ×${times} (${loaded?.device ?? ''} ${loaded?.dtype ?? ''})`, async () => {
      if (!photo) return
      for (let i = 0; i < times; i++) {
        const t = performance.now()
        const res = await getClient().segment(await createImageBitmap(photo.bitmap), maskSide)
        const total = performance.now() - t
        setResult(res)
        setRuns((r) => [...r, { n: r.length + 1, timings: res.timings, total }])
      }
    })

  const selectedModel = SEGMENTATION_MODELS.find((m) => m.id === modelId)

  return (
    <div className="pt-safe pb-safe px-safe mx-auto max-w-lg space-y-5 pb-10">
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          aria-label="Back"
          className="-ml-2 p-2"
          onClick={() => {
            void navigate('/settings')
          }}
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-xl font-bold">Segmentation lab</h1>
      </div>

      {leftover && (
        <p className="rounded-2xl bg-red-100 p-3 text-sm text-red-900">
          The last session ended while “{leftover.what}” was running ({new Date(leftover.at).toLocaleTimeString()}).
          iOS most likely killed the page for using too much memory.
        </p>
      )}

      <Panel title="Environment">
        <KV k="Network" v={online ? 'Online' : 'Offline'} />
        <KV k="WebGPU in page" v={'gpu' in navigator ? 'Available' : 'Not available'} />
        <KV k="Cross-origin isolated (WASM threads)" v={self.crossOriginIsolated ? 'Yes' : 'No (single thread)'} />
        <p className="text-muted pt-1 text-xs break-all">{navigator.userAgent}</p>
      </Panel>

      <Panel title="1 · Model">
        <Select label="Model" value={modelId} onChange={setModelId}>
          {SEGMENTATION_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <Segmented label="Device" options={DEVICES} value={device} onChange={setDevice} />
        <Segmented
          label="Precision"
          options={DTYPES}
          value={dtype}
          onChange={setDtype}
          format={(d) => `${d} · ${String(selectedModel?.sizesMB[d] ?? '?')} MB`}
        />
        <p className="text-muted text-xs">
          Suggested: WebGPU + fp16, or WASM + q8. q8 on WebGPU and fp16 on WASM usually run slower.
        </p>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={!!busy} onClick={() => void loadModel()}>
            {loaded ? 'Reload model' : 'Load model'}
          </Button>
          {loaded && (
            <Button variant="secondary" disabled={!!busy} onClick={unload}>
              Unload
            </Button>
          )}
        </div>
        {progress && (
          <div>
            <div className="bg-line h-2 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full transition-[width]"
                style={{ width: `${progress.total ? (100 * progress.loaded) / progress.total : 0}%` }}
              />
            </div>
            <p className="text-muted mt-1 text-xs tabular-nums">
              {(progress.loaded / 1e6).toFixed(1)} / {(progress.total / 1e6).toFixed(1)} MB
            </p>
          </div>
        )}
        {loaded && (
          <div className="bg-accent-soft rounded-xl p-3 text-sm">
            Loaded <strong>{loaded.modelId.split('/')[1]}</strong> on <strong>{loaded.device}</strong> ({loaded.dtype})
            in {(loaded.ms / 1000).toFixed(1)} s · WebGPU adapter in worker: {loaded.webgpuAvailable ? 'yes' : 'no'}
            {loaded.fallbackReason && <p className="mt-1 text-red-700">{loaded.fallbackReason}</p>}
          </div>
        )}
      </Panel>

      <Panel title="2 · Photo">
        <label className="bg-surface border-line flex h-12 cursor-pointer items-center justify-center rounded-full border text-[15px] font-semibold">
          {photo ? 'Choose another photo' : 'Choose photo'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {photo && (
          <p className="text-muted text-xs">
            Original {photo.originalWidth}×{photo.originalHeight} → working {photo.bitmap.width}×
            {photo.bitmap.height} · decoded in {photo.decodeMs.toFixed(0)} ms
          </p>
        )}
      </Panel>

      <Panel title="3 · Segment">
        <Segmented
          label="Mask resolution (long side)"
          options={[512, 1024] as const}
          value={maskSide}
          onChange={setMaskSide}
          format={String}
        />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!!busy || !loaded || !photo} onClick={() => void segment(1)}>
            Segment
          </Button>
          <Button variant="secondary" disabled={!!busy || !loaded || !photo} onClick={() => void segment(5)}>
            Run 5×
          </Button>
        </div>
        {busy && <p className="text-muted animate-pulse text-sm">{busy}…</p>}
        {error && <p className="rounded-xl bg-red-100 p-3 text-sm break-words text-red-900">{error}</p>}
        {runs.length > 0 && <RunsTable runs={runs} />}
      </Panel>

      {photo && (
        <Panel title="Result">
          <Segmented
            label="View"
            options={['classes', 'cutout', 'photo'] as const}
            value={mode}
            onChange={setMode}
          />
          <MaskCanvas
            image={photo.bitmap}
            labels={result?.labels ?? null}
            maskWidth={result?.width ?? 0}
            maskHeight={result?.height ?? 0}
            mode={mode}
          />
          {result && <Legend labels={result.labels} />}
        </Panel>
      )}

      <Panel title="Model cache (offline)">
        <CachePanel refreshKey={cacheKey} />
      </Panel>

      <Panel title="Memory">
        <p className="text-muted text-sm leading-relaxed">
          Safari doesn't expose memory usage to web pages. To test memory, run “Run 5×” several times and try
          the larger models. If iOS runs out of memory it reloads the page, and a red notice appears at the top
          the next time you open this screen. “Unload” ends the worker and frees the model's memory.
        </p>
      </Panel>
    </div>
  )
}

function RunsTable({ runs }: { runs: RunRecord[] }) {
  const f = (ms: number) => ms.toFixed(0)
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-muted text-xs">
        <tr className="text-right">
          <th className="text-left font-medium">Run</th>
          <th className="font-medium">Prep</th>
          <th className="font-medium">Model</th>
          <th className="font-medium">Post</th>
          <th className="font-medium">Total ms</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.n} className="text-right">
            <td className="text-left">#{r.n}</td>
            <td>{f(r.timings.preprocess)}</td>
            <td>{f(r.timings.inference)}</td>
            <td>{f(r.timings.postprocess)}</td>
            <td className="font-semibold">{f(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Legend({ labels }: { labels: Uint8Array }) {
  const counts = new Array<number>(CLOTHES_LABELS.length).fill(0)
  for (const l of labels) counts[l] = (counts[l] ?? 0) + 1
  const rows = counts
    .map((count, i) => ({ i, pct: (100 * count) / labels.length }))
    .filter((r) => r.i !== 0 && r.pct >= 0.05)
    .sort((a, b) => b.pct - a.pct)
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(({ i, pct }) => {
        const [r, g, b] = LABEL_COLORS[i] ?? [0, 0, 0]
        return (
          <li key={i} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: `rgb(${r} ${g} ${b})` }} />
            <span className="flex-1 truncate">{CLOTHES_LABELS[i]}</span>
            <span className="text-muted tabular-nums">{pct.toFixed(1)}%</span>
          </li>
        )
      })}
    </ul>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface border-line space-y-3 rounded-2xl border p-4">
      <h2 className="text-muted text-xs font-semibold tracking-wider uppercase">{title}</h2>
      {children}
    </section>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span>{k}</span>
      <span className="text-muted text-right">{v}</span>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <select
        className="bg-canvas border-line rounded-lg border px-2 py-1"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      >
        {children}
      </select>
    </label>
  )
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = String,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  format?: (v: T) => string
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm">{label}</p>
      <div className="bg-canvas flex rounded-xl p-1">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            aria-pressed={o === value}
            onClick={() => {
              onChange(o)
            }}
            className={`flex-1 rounded-lg px-1 py-1.5 text-xs font-medium transition ${
              o === value ? 'bg-surface shadow-sm' : 'text-muted'
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}
