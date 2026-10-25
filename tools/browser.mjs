// Shared headless browser launch for the tools: system Chrome with WebGPU (`CHROME` overrides its path) or Playwright WebKit.
import { chromium, webkit } from 'playwright-core';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PORT = process.env.PORT || 5190;
const GPU = ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist'];
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

// kind: 'chrome' | 'phone' (Chrome) | 'webkit'; uncapped: render as fast as possible
export const launch = (kind = 'chrome', { uncapped = false } = {}) => (kind === 'webkit'
  ? webkit.launch()
  : chromium.launch({ executablePath: CHROME, headless: true, args: uncapped ? [...GPU, ...UNCAPPED] : GPU }));

// Page options: the phone emulation for 'phone', else the given desktop options.
export const pageOptions = (kind, desktop) => (kind === 'phone'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : desktop);
