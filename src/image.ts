export async function paletteFromImage(file: File, signal: AbortSignal): Promise<string[]> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be read. Try another JPEG, PNG, or WebP.'); }
  try {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (bitmap.width * bitmap.height > 48_000_000) throw new Error('This image is too large to decode safely. Resize it and try again.');
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return await new Promise<string[]>((resolve, reject) => {
      const worker = new Worker(new URL('./palette.worker.ts', import.meta.url), { type: 'module' });
      const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<{ colors?: string[]; error?: string }>) => {
        cleanup();
        if (event.data.colors) resolve(event.data.colors); else reject(new Error(event.data.error));
      };
      worker.onerror = () => { cleanup(); reject(new Error('Color extraction failed. Try a different image.')); };
      worker.postMessage(pixels.buffer, [pixels.buffer]);
    });
  } finally { bitmap.close(); }
}
