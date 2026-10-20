import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { BulletList, PhotoTipsList } from '../components/InfoContent'
import { PRIVACY_POINTS } from '../content/info'
import { InstallInstructions } from '../components/InstallInstructions'
import { PageHeader } from '../components/PageHeader'
import { Disclosure, Row, Section, Toggle } from '../components/SettingsUI'
import { AdvancedSection } from './settings/AdvancedSection'
import { BaseModelSection } from './settings/BaseModelSection'
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
        <BaseModelSection />

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
            <span className="text-muted block truncate text-right text-sm">{styles.map((s) => s.name).join(', ')}</span>
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

        <AdvancedSection />

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
