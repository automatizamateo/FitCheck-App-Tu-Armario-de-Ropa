import { EmptyState } from '../components/EmptyState'
import { CalendarIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'

export function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" />
      <EmptyState
        icon={<CalendarIcon />}
        title="Nothing logged yet"
        body="Log what you wore each day, or plan outfits ahead. Your wear counts update automatically."
      />
    </>
  )
}
