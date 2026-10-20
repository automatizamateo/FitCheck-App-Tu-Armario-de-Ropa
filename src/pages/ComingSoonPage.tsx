import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { CameraIcon } from '../components/Icons'

export function ComingSoonPage({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate()
  return (
    <div className="pt-safe flex min-h-dvh flex-col justify-center">
      <EmptyState
        icon={<CameraIcon />}
        title={title}
        body={body}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void navigate(-1)
            }}
          >
            Go back
          </Button>
        }
      />
    </div>
  )
}
