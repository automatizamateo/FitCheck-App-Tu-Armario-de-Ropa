import { EmptyState } from '../components/EmptyState'
import { ChartIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'

export function InsightsPage() {
  return (
    <>
      <PageHeader title="Insights" />
      <EmptyState
        icon={<ChartIcon />}
        title="No insights yet"
        body="See your most and least worn items, and get a nudge about clothes you haven't worn in a while."
      />
    </>
  )
}
