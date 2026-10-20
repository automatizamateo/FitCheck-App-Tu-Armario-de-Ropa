import { useEffect, useRef, useState, type RefObject } from 'react'
import { ViewportCanvas, type ViewportHandle } from '../../components/ViewportCanvas'
import type { PoseLandmarks } from '../../domain/types'
import { MaskEditorEngine, type MaskEditorState } from './maskEditorEngine'

export type { MaskEditorState } from './maskEditorEngine'

export interface MaskEditorApi {
  undo: () => void
  redo: () => void
  /** Current mask as 0/1. */
  getMask: () => Uint8Array
}

interface MaskEditorProps {
  photo: ImageBitmap
  initialMask: Uint8Array // 0/1, read once on mount
  landmarks: PoseLandmarks
  state: MaskEditorState
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  apiRef: RefObject<MaskEditorApi | null>
}

/** React wrapper around MaskEditorEngine; painting and gestures never re-render this component. */
export function MaskEditor({ photo, initialMask, landmarks, state, onHistoryChange, apiRef }: MaskEditorProps) {
  const viewport = useRef<ViewportHandle>(null)
  const [engine] = useState(() => new MaskEditorEngine(photo, initialMask, landmarks, state))

  useEffect(() => {
    engine.attach(viewport.current, onHistoryChange)
    apiRef.current = {
      undo: () => {
        engine.undo()
      },
      redo: () => {
        engine.redo()
      },
      getMask: () => engine.getMask(),
    }
    return () => {
      engine.dispose()
    }
  }, [engine, onHistoryChange, apiRef])

  useEffect(() => {
    engine.setState(state)
  }, [engine, state])

  return (
    <ViewportCanvas
      ref={viewport}
      contentWidth={engine.width}
      contentHeight={engine.height}
      draw={engine.draw}
      tool={state.preview ? undefined : engine.tool}
      onDoubleTap={engine.cancelPendingDot}
      className="bg-[#0c0a09]"
    />
  )
}
