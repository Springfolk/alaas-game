// One texture image: fetched and decoded to an ImageBitmap (pre-flipped, alpha not premultiplied, no colour
// conversion), scaled to fit `max`. Runs in a load worker (src/load/worker.js 'bitmap': Safari decodes on the
// calling thread, ~20 ms per megapixel) or, as the fallback, on the main thread. flip = false: rows as stored.
export async function loadBitmap(url, max, tries = 3, flip = true) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const o = { imageOrientation: flip ? 'flipY' : 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    let bmp = await createImageBitmap(await r.blob(), o);
    const k = max / Math.max(bmp.width, bmp.height);
    if (k < 1) {
      const small = await createImageBitmap(bmp, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeQuality: 'high',
        resizeWidth: Math.max(1, Math.round(bmp.width * k)), resizeHeight: Math.max(1, Math.round(bmp.height * k)) });
      bmp.close(); bmp = small;
    }
    return bmp;
  } catch (e) {
    if (tries > 1) { await new Promise((ok) => setTimeout(ok, 400)); return loadBitmap(url, max, tries - 1, flip); }
    throw e;
  }
}
