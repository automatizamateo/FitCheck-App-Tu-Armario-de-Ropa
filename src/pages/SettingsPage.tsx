import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { BulletList, PhotoTipsList } from '../components/InfoContent'
import { PRIVACY_POINTS } from '../content/info'
import { InstallInstructions } from '../components/InstallInstructions'
import { PageHeader } from '../components/PageHeader'
import { APP_CONFIG } from '../config/app'
import { db } from '../db/db'
import { updateSettings, useSettings } from '../db/settings'
import { isStandalone } from '../lib/platform'
import { formatBytes, getStorageStatus, requestPersistentStorage, type StorageStatus } from '../lib/storage'

export function SettingsPage() {
  const settings = useSettings()
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const [storage, setStorage] = useState<StorageStatus | null>(null)

  useEffect(() => {
    void getStorageStatus().then(setStorage)
  }, [])

  const askPersist = async () => {
    await requestPersistentStorage()
    setStorage(await getStorageStatus())
  }

  if (!settings) return null

  return (
    <>
      <PageHeader title="Settings" />
      <div className="px-safe space-y-6 pb-6">
        <Section title="Wardrobe">
          <Row label="Unused after">
            <select
              className="text-muted bg-transparent text-right"
              value={settings.unusedThresholdDays}
              onChange={(e) => void updateSettings({ unusedThresholdDays: Number(e.target.value) })}
            >
              {[30, 45, 60, 90, 120, 180].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </Row>
          <Row label="Keep original photos" hint="Uses much more storage">
            <Toggle
              checked={settings.keepOriginalPhotos}
              onChange={(v) => void updateSettings({ keepOriginalPhotos: v })}
              label="Keep original photos"
            />
          </Row>
          <Row label="Styles">
            <span className="text-muted text-right text-sm">{styles.map((s) => s.name).join(', ')}</span>
          </Row>
        </Section>

        <Section title="Storage">
          <Row label="Used">
            <span className="text-muted">
              {storage?.usage != null ? formatBytes(storage.usage) : '—'}
              {storage?.quota != null && ` of ${formatBytes(storage.quota)}`}
            </span>
          </Row>
          <Row label="Persistent storage" hint="Protects your data from being cleared by iOS">
            {storage?.persisted ? (
              <span className="text-accent font-medium">On</span>
            ) : (
              <button type="button" className="text-accent font-medium" onClick={() => void askPersist()}>
                {storage?.persisted === null ? 'Unavailable' : 'Turn on'}
              </button>
            )}
          </Row>
          <Row label="Installed to Home Screen">
            <span className="text-muted">{isStandalone() ? 'Yes' : 'No'}</span>
          </Row>
        </Section>

        <Section title="Help">
          <Disclosure label="Install to Home Screen">
            <InstallInstructions />
          </Disclosure>
          <Disclosure label="Photo tips">
            <PhotoTipsList />
          </Disclosure>
          <Disclosure label="Privacy">
            <BulletList items={PRIVACY_POINTS} />
          </Disclosure>
        </Section>

        <VersionFooter />
      </div>
    </>
  )
}

/** Tapping the version 5 times opens the hidden segmentation lab. */
function VersionFooter() {
  const navigate = useNavigate()
  const taps = useRef({ count: 0, last: 0 })
  const onTap = () => {
    const now = Date.now()
    taps.current.count = now - taps.current.last < 600 ? taps.current.count + 1 : 1
    taps.current.last = now
    if (taps.current.count >= 5) void navigate('/lab/segmentation')
  }
  return (
    <p className="text-muted text-center text-xs" onClick={onTap}>
      {APP_CONFIG.name} {__APP_VERSION__} · Works offline · No data leaves this device
    </p>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-muted mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{title}</h2>
      <div className="bg-surface border-line divide-line divide-y overflow-hidden rounded-2xl border">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {hint && <p className="text-muted text-xs">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 text-[15px] [&::-webkit-details-marker]:hidden">
        {label}
        <span className="text-muted transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        onChange(!checked)
      }}
      className={`relative h-[31px] w-[51px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}
