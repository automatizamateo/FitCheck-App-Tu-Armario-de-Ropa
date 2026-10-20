import { useEffect, useMemo } from 'react'

/** Object URL for a Blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  return url
}
