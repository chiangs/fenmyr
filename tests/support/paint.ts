// A colour as the pixel it paints. getComputedStyle hands back whatever form the browser keeps a colour in: color-mix()
// comes back as oklab(...) or oklch(...), rgb(from …) as color(srgb …). A test that needs numbers calls window.__paint
// inside page.evaluate, after installPaint(page); one canvas pixel is the same in every form.
import type { Page } from 'playwright';

declare global {
  interface Window {
    // [red, green, blue] as 0 to 255 and alpha as 0 to 1
    __paint: (css: string) => [number, number, number, number];
  }
}

export const installPaint = (page: Page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    window.__paint = css => {
      if (!ctx) return [0, 0, 0, 1];
      ctx.clearRect(0, 0, 1, 1);
      // a value the canvas can't read leaves the last fill, so start from one that shows
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
  });
