import { MAX_PHOTO_DATA_URL } from "./style";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_EDGE_PX = 900;
const INITIAL_QUALITY = 0.9;

export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // 某些格式/浏览器不支持 createImageBitmap，回退到 <img>。
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("无法解析该图片，请换一张图片。"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 把用户选择的图片缩放、压平成白底 JPEG。
 * 典型 900px 长边的照片会得到约 100–300 KB 的 data URL，
 * 足够 A4 简历打印，同时不会挤占 localStorage。
 */
export async function photoFileToDataUrl(file: File): Promise<string> {
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
    throw new Error("请选择 PNG、JPEG 或 WebP 格式的图片。");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("图片超过 12 MB，请先压缩后再上传。");
  }

  const bitmap = await loadBitmap(file);
  const sourceWidth = "width" in bitmap ? bitmap.width : 1;
  const sourceHeight = "height" in bitmap ? bitmap.height : 1;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("无法读取图片尺寸。");
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    if ("close" in bitmap) bitmap.close();
    throw new Error("浏览器无法处理该图片。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  let quality = INITIAL_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_PHOTO_DATA_URL && quality > 0.5) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrl.length > MAX_PHOTO_DATA_URL) {
    throw new Error("图片压缩后仍然过大，请选择尺寸更小的图片。");
  }
  return dataUrl;
}
