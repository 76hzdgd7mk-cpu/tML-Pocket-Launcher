export async function prepareBackground(source: string): Promise<string> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法处理背景图片');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.82);
  if (data.length > 2 * 1024 * 1024) throw new Error('图片处理后仍然过大，请选择尺寸较小的图片。');
  return data;
}
