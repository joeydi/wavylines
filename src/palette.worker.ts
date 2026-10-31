import { extractColors } from './extraction.ts';

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ colors: extractColors(new Uint8ClampedArray(event.data)) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to extract colors.' }); }
};
