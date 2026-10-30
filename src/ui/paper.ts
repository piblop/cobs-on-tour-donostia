/** Generates the scrapbook paper grain in code and exposes it as a CSS variable. */
export function installPaperTexture(): void {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#fbf5e9';
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  // A few long fibres.
  g.strokeStyle = 'rgba(150, 120, 90, 0.06)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.random() * 30, y + Math.random() * 10, x + Math.random() * 60 - 30, y + Math.random() * 20);
    g.stroke();
  }
  try {
    document.documentElement.style.setProperty('--paper-texture', `url(${c.toDataURL('image/png')})`);
  } catch {
    // Some privacy modes block canvas export; plain paper colour still works.
  }
}
