"use client";
import { MAX_PHOTO_BYTES } from "@/lib/api";

export const MAX_EDGE = 1600;

/** Size that fits `max` on the long edge, never upscaling. */
export function fitSize(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

/** Draw a video frame or image into a ~1600px JPEG under the analyze-photo size limit. */
export async function encodeJpeg(source: CanvasImageSource, srcW: number, srcH: number): Promise<{ blob: Blob; url: string }> {
  const { width, height } = fitSize(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(source, 0, 0, width, height);
  let blob = await toBlob(canvas, 0.85);
  for (const q of [0.75, 0.65, 0.55]) {
    if (blob.size <= MAX_PHOTO_BYTES) break;
    blob = await toBlob(canvas, q);
  }
  return { blob, url: URL.createObjectURL(blob) };
}

export function captureVideoFrame(video: HTMLVideoElement) {
  return encodeJpeg(video, video.videoWidth, video.videoHeight);
}

/** Library / file-input photo (JPEG, PNG, WebP, or HEIC where the browser decodes it) -> JPEG. */
export async function fileToJpeg(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return await encodeJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
