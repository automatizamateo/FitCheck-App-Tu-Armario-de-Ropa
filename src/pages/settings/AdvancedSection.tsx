import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Disclosure, Row } from '../../components/SettingsUI'
import { DEFAULT_ML_SETTINGS } from '../../db/db'
import { updateMlSettings, useSettings } from '../../db/settings'
import type { MlSettings } from '../../domain/types'
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

  const refineStatus =
    ml.refineEdges !== 'auto'
      ? null
      : ml.refineCrashed
        ? 'off: ran out of memory'
        : ml.refineBenchmarkMs !== undefined
          ? `${shouldRefine(ml) ? 'on' : 'off'}: last run ${(ml.refineBenchmarkMs / 1000).toFixed(1)} s (limit ${REFINE_AUTO_LIMIT_MS / 1000} s)`
          : 'on until measured'

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
            <Row label="Refine edges" hint={refineStatus ?? 'Better quality, slower'}>
              <Select
                value={ml.refineEdges}
                onChange={(v) => {
                  set({ refineEdges: v as MlSettings['refineEdges'] })
                }}
                options={[
                  ['auto', 'Auto'],
                  ['on', 'On'],
                  ['off', 'Off'],
                ]}
              />
            </Row>
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
                  set({ ...DEFAULT_ML_SETTINGS, refineBenchmarkMs: undefined, refineCrashed: undefined, webgpuBroken: undefined, crashFallback: undefined, pendingNotice: undefined })
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
      </div>
    </section>
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
