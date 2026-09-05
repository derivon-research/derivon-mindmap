type CanvasPixelOptions = {
  color?: readonly number[];
  center?: boolean;
  clientCoordinates?: boolean;
};

/** Serializable for Playwright evaluate(); locates painted pixels, never G6 objects. */
export function findCanvasPixel({ color = [22, 139, 114], center = false, clientCoordinates = false }: CanvasPixelOptions = {}) {
  for (const canvas of document.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d');
    if (!context) continue;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const matches = (x: number, y: number) => {
      const i = (y * canvas.width + x) * 4;
      return pixels[i] === color[0] && pixels[i + 1] === color[1]
        && pixels[i + 2] === color[2] && pixels[i + 3] === 255;
    };
    const bounds = canvas.getBoundingClientRect();
    const point = (x: number, y: number) => ({
      x: x * bounds.width / canvas.width + (clientCoordinates ? bounds.x : 0),
      y: y * bounds.height / canvas.height + (clientCoordinates ? bounds.y : 0),
    });
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (!matches(x, y)) continue;
        if (!center) {
          let endX = x;
          while (endX + 1 < canvas.width && matches(endX + 1, y)) endX++;
          const midX = Math.floor((x + endX) / 2);
          let endY = y;
          while (endY + 1 < canvas.height && matches(midX, endY + 1)) endY++;
          return point(midX + 0.5, (y + endY + 1) / 2);
        }
        count++;
        sumX += x;
        sumY += y;
      }
    }
    if (count) return point(sumX / count, sumY / count);
  }
  return undefined;
}
