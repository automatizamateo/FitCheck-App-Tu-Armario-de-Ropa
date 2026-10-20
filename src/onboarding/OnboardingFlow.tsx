import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { CheckIcon, HangerIcon, LockIcon, PersonIcon, CameraIcon, ShareIcon } from '../components/Icons'
import { BulletList, PhotoTipsList } from '../components/InfoContent'
import { PRIVACY_POINTS } from '../content/info'
import { InstallInstructions } from '../components/InstallInstructions'
import { APP_CONFIG } from '../config/app'
import { updateSettings } from '../db/settings'
import { isStandalone } from '../lib/platform'
import { requestPersistentStorage } from '../lib/storage'

interface Step {
  icon: ReactNode
  title: string
  body: ReactNode
}

const STEPS: Step[] = [
  {
    icon: <HangerIcon />,
    title: `Welcome to ${APP_CONFIG.name}`,
    body: (
      <p className="text-muted text-[17px] leading-relaxed">
        Your wardrobe, on your own body. Photograph each piece while you wear it, build outfits, and see them from
        the front, side and back. Pick an outfit in seconds instead of improvising every morning.
      </p>
    ),
  },
  {
    icon: <ShareIcon />,
    title: 'Add to Home Screen',
    body: <InstallStep />,
  },
  {
    icon: <LockIcon />,
    title: 'Private by design',
    body: <BulletList items={PRIVACY_POINTS} />,
  },
  {
    icon: <CameraIcon />,
    title: 'Photo tips',
    body: (
      <>
        <p className="text-muted mb-4 text-[15px]">Good photos make clothes line up perfectly on your body.</p>
        <PhotoTipsList />
      </>
    ),
  },
  {
    icon: <PersonIcon />,
    title: 'Your base model',
    body: (
      <div className="space-y-4 text-[15px] leading-relaxed">
        <p className="text-muted">
          Your outfits are shown on photos of you. You'll take three photos (front, side and back) wearing tight
          thermal clothing, and {APP_CONFIG.name} removes the background.
        </p>
        <p className="bg-accent-soft rounded-2xl p-4">
          Base model capture is coming in the next update. For now, finish setup and explore the app.
        </p>
      </div>
    ),
  },
]

function InstallStep() {
  if (isStandalone()) {
    return (
      <p className="text-accent flex items-center gap-2 text-[17px] font-medium">
        <CheckIcon className="size-6" /> Installed. You're all set.
      </p>
    )
  }
  return (
    <div className="space-y-5">
      <p className="text-muted text-[15px] leading-relaxed">
        Installing keeps your wardrobe safe: iOS can clear data from websites you haven't visited in a while, but
        not from apps on your Home Screen.
      </p>
      <InstallInstructions />
    </div>
  )
}

export function OnboardingFlow() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const step = STEPS[index] ?? STEPS[0]
  const isLast = index === STEPS.length - 1
  if (!step) return null

  const finish = async () => {
    await updateSettings({ onboardingDone: true })
    await requestPersistentStorage()
    void navigate('/wardrobe', { replace: true })
  }

  return (
    <div className="pt-safe pb-safe px-safe mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="flex h-12 items-center justify-between">
        {index > 0 ? (
          <button type="button" className="text-muted -ml-2 p-2 text-[15px]" onClick={() => {
              setIndex(index - 1)
            }}>
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'bg-ink w-5' : 'bg-line w-1.5'}`}
            />
          ))}
        </div>
        <span className="w-10" />
      </div>

      <div key={index} className="flex-1 animate-[fade-in_250ms_ease-out] overflow-y-auto pt-8 pb-6">
        <div className="bg-accent-soft text-accent mb-6 flex size-16 items-center justify-center rounded-2xl [&>svg]:size-8">
          {step.icon}
        </div>
        <h1 className="mb-4 text-[28px] leading-tight font-bold tracking-tight">{step.title}</h1>
        {step.body}
      </div>

      <div className="pb-4">
        <Button className="w-full" onClick={() => {
            if (isLast) void finish()
            else setIndex(index + 1)
          }}>
          {isLast ? 'Finish setup' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
