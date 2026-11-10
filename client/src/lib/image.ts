/** Crops the middle square of a photo and shrinks it to `size`×`size` (WebP, or JPEG where WebP can't be made). */
export async function squarePhoto(file: File, size = 256): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPG, PNG or WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is over 15 MB. Choose a smaller one.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // respects the photo's rotation (phone pictures)
  } catch {
    throw new Error("Couldn't read that image. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86));
  const webp = await toBlob("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await toBlob("image/jpeg"); // Safari can't encode WebP
  if (!blob) throw new Error("Couldn't prepare the photo.");
  return blob;
}
