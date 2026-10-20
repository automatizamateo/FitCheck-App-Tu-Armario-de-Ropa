import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Section } from '../../components/SettingsUI'
import { VIEWS, type View } from '../../domain/types'
import { useBaseModel } from '../../features/baseModel/store'
import { useObjectUrl } from '../../lib/useObjectUrl'

export function BaseModelSection() {
  const navigate = useNavigate()
  const model = useBaseModel()
  const [retake, setRetake] = useState<View | null>(null)

  if (model === undefined) return null

  return (
    <Section title="Base model">
      {model ? (
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {VIEWS.map((v) => (
              <div key={v} className="text-center">
                <Thumb blob={model.views[v].image} />
                <p className="mt-1 text-xs capitalize">{v}</p>
                <button
                  type="button"
                  className="text-accent h-11 w-full text-sm font-medium"
                  onClick={() => {
                    setRetake(v)
                  }}
                >
                  Retake
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-muted mb-3 text-sm">Your outfits are shown on photos of you. Create your base model to start.</p>
          <Button
            className="w-full"
            onClick={() => {
              void navigate('/base-model')
            }}
          >
            Create base model
          </Button>
        </div>
      )}
      <ConfirmSheet
        open={retake !== null}
        title={`Retake ${retake ?? ''} view?`}
        confirmLabel="Retake"
        onCancel={() => {
          setRetake(null)
        }}
        onConfirm={() => {
          void navigate(`/base-model?view=${retake ?? 'front'}`)
        }}
      >
        Clothes you've already added are positioned for your current photo, so they may need re-aligning after a
        retake. Stand in the same spot and wear the same thermals to keep differences small.
      </ConfirmSheet>
    </Section>
  )
}

function Thumb({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob)
  return (
    <div className="bg-canvas aspect-[3/4] overflow-hidden rounded-xl">
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </div>
  )
}
