import jpeg from "jpeg-js";

// A decoder can conceal a damaged joining frame as a complete, uniformly gray
// JPEG and still exit successfully. Do not replace a detailed last-good still
// with that image. The visible capture timestamp remains the age indication.
export function hasPreviewDetail(data) {
  try {
    const image = jpeg.decode(data, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 96 });
    if (image.width < 16 || image.height < 16) return false;
    let count = 0, sum = 0, squares = 0;
    for (let y = 0; y < image.height; y += 8) for (let x = 0; x < image.width; x += 8) {
      const offset = (y * image.width + x) * 4;
      const luma = (77 * image.data[offset] + 150 * image.data[offset + 1] + 29 * image.data[offset + 2]) / 256;
      count++; sum += luma; squares += luma * luma;
    }
    return squares / count - (sum / count) ** 2 > 0.5625;
  } catch { return false; }
}
