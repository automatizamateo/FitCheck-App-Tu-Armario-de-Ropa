export interface LoadedImage {
  bitmap: ImageBitmap
  originalWidth: number
  originalHeight: number
}

/**
 * Decodes a photo and downscales it so its longest side is at most maxSide.
 * Asks the browser to resize while decoding, so a 48 MP iPhone photo never sits in memory at full size.
 */
export async function loadImageFile(file: Blob, maxSide: number): Promise<LoadedImage> {
  const { width, height } = await readDimensions(file)
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const resizeWidth = Math.round(width * scale)
  const resizeHeight = Math.round(height * scale)
  try {
    const bitmap = await createImageBitmap(file, { resizeWidth, resizeHeight, resizeQuality: 'high' })
    return { bitmap, originalWidth: width, originalHeight: height }
  } catch {
    // Older WebKit: decode via <img> and scale on a canvas.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const canvas = new OffscreenCanvas(resizeWidth, resizeHeight)
      canvas.getContext('2d')?.drawImage(img, 0, 0, resizeWidth, resizeHeight)
      return { bitmap: canvas.transferToImageBitmap(), originalWidth: width, originalHeight: height }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}
