import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Disclosure, Row } from '../../components/SettingsUI'
import { DEFAULT_ML_SETTINGS } from '../../db/db'
import { updateMlSettings, useSettings } from '../../db/settings'
import type { MlSettings } from '../../domain/types'
import { clearDebugLog, formatDebugLog, readDebugLog } from '../../lib/debugLog'
import { isIOS } from '../../lib/platform'
import { deleteDownloadedModels, downloadedModelsMB } from '../../ml/downloads'
import { REFINE_AUTO_LIMIT_MS, resolveSegmentationConfig, shouldRefine } from '../../ml/mlConfig'
import { SEGMENTATION_MODELS } from '../../ml/models'

const modelName = (id: string) => SEGMENTATION_MODELS.find((m) => m.id === id)?.label ?? id

export function AdvancedSection() {
  const navigate = useNavigate()
  const settings = useSettings()
  const [cachedMB, setCachedMB] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    void downloadedModelsMB().then((mb) => {
      if (!cancelled) setCachedMB(mb)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  if (!settings) return null
  const ml = settings.ml
  const resolved = resolveSegmentationConfig(ml)
  const set = (changes: Partial<MlSettings>) => void updateMlSettings(changes)

  const ios = isIOS()
  const refineHint =
    ml.refineEdges === 'on'
      ? ios
        ? '⚠ May crash on some devices'
        : 'Better quality, slower'
      : ml.refineEdges === 'off'
        ? 'Better quality, slower'
        : ios
          ? 'Auto: off on iPhone and iPad'
          : ml.refineBenchmarkMs !== undefined
            ? `Auto: ${shouldRefine(ml, ios) ? 'on' : 'off'}, last run ${(ml.refineBenchmarkMs / 1000).toFixed(1)} s (limit ${REFINE_AUTO_LIMIT_MS / 1000} s)`
            : 'Auto: on until measured'

  return (
    <section>
      <h2 className="text-muted mb-2 px-1 text-xs font-semibold tracking-wider uppercase">Advanced</h2>
      <div className="bg-surface border-line divide-line divide-y overflow-hidden rounded-2xl border">
        <Disclosure label="AI processing">
          <div className="divide-line -mx-4 divide-y">
            <Row label="Background model" hint={ml.model === 'auto' ? `Auto: ${modelName(resolved.modelId)}` : undefined}>
              <Select
                value={ml.model}
                onChange={(v) => {
                  set({ model: v })
                }}
                options={[['auto', 'Auto'], ...SEGMENTATION_MODELS.map((m) => [m.id, m.label] as [string, string])]}
              />
            </Row>
            <Row label="Processor" hint={ml.device === 'auto' && ml.webgpuBroken ? 'Auto: CPU (GPU failed before)' : undefined}>
              <Select
                value={ml.device}
                onChange={(v) => {
                  set({ device: v as MlSettings['device'] })
                }}
                options={[
                  ['auto', 'Auto'],
                  ['webgpu', 'GPU (WebGPU)'],
                  ['wasm', 'CPU (WASM)'],
                ]}
              />
            </Row>
            <Row label="Precision">
              <Select
                value={ml.dtype}
                onChange={(v) => {
                  set({ dtype: v as MlSettings['dtype'] })
                }}
                options={[
                  ['auto', 'Auto'],
                  ['q8', 'q8 (smallest)'],
                  ['fp16', 'fp16'],
                  ['fp32', 'fp32 (largest)'],
                ]}
              />
            </Row>
            <Row label="Refine edges" hint={refineHint}>
              <Select
                value={ml.refineEdges}
                onChange={(v) => {
                  set({ refineEdges: v as MlSettings['refineEdges'] })
                }}
                options={[
                  ['auto', 'Auto'],
                  ['on', ios ? 'On (may crash)' : 'On'],
                  ['off', 'Off'],
                ]}
              />
            </Row>
            {ios && ml.refineEdges === 'on' && (
              <p className="bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 dark:bg-amber-950 dark:text-amber-50">
                Refining edges runs a second AI model and may crash on some devices. If FitCheck closes while processing, it
                turns this off again by itself.
              </p>
            )}
            {ml.lastUsed && (
              <Row label="Last used">
                <span className="text-muted text-right text-xs">
                  {modelName(ml.lastUsed.modelId)}
                  <br />
                  {ml.lastUsed.device} · {ml.lastUsed.dtype}
                </span>
              </Row>
            )}
            <Row label="Downloaded models" hint={cachedMB !== null ? `${cachedMB.toFixed(0)} MB stored` : undefined}>
              <button
                type="button"
                className="h-11 text-sm font-medium text-red-600"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  setConfirmDelete(false)
                  void deleteDownloadedModels().then(() => {
                    setRefresh((r) => r + 1)
                  })
                }}
              >
                {confirmDelete ? 'Tap again' : 'Delete'}
              </button>
            </Row>
            <div className="flex gap-4 px-4 py-2">
              <button
                type="button"
                className="text-accent h-11 text-sm font-medium"
                onClick={() => {
                  set({ ...DEFAULT_ML_SETTINGS, refineBenchmarkMs: undefined, webgpuBroken: undefined, pendingNotice: undefined })
                }}
              >
                Reset to automatic
              </button>
              <button
                type="button"
                className="text-accent h-11 text-sm font-medium"
                onClick={() => {
                  void navigate('/lab/segmentation')
                }}
              >
                Segmentation lab
              </button>
            </div>
          </div>
        </Disclosure>
        <Disclosure label="Debug log">
          <DebugLogPanel />
        </Disclosure>
      </div>
    </section>
  )
}

/** The persistent pipeline log, newest last. Survives iOS killing the page, so it shows which step died. */
function DebugLogPanel() {
  const [text, setText] = useState(() => formatDebugLog(readDebugLog()))
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <pre className="bg-canvas border-line max-h-80 overflow-auto rounded-xl border p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap">
        {text || 'Empty.'}
      </pre>
      <div className="flex gap-4">
        <button
          type="button"
          className="text-accent h-11 text-sm font-medium"
          onClick={() => {
            setText(formatDebugLog(readDebugLog()))
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          className="text-accent h-11 text-sm font-medium"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="h-11 text-sm font-medium text-red-600"
          onClick={() => {
            clearDebugLog()
            setText('')
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <select
      className="text-muted h-11 max-w-44 bg-transparent text-right"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}
