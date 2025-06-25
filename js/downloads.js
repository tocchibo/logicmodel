function downloadPNG() {
  const svg = document.querySelector('#output svg');
  if (!svg) {
    showError(ERROR_MESSAGES.NO_SVG_GENERATED);
    return;
  }

  const serializer = new XMLSerializer();
  const svgData = serializer.serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.onload = () => {
    const padding = GRAPHVIZ_CONFIG.PNG_PADDING;
    const canvas = document.createElement("canvas");
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + padding * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = GRAPHVIZ_CONFIG.CANVAS_BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, padding, padding);
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = FILE_NAMES.LOGIC_MODEL_PNG;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showError(ERROR_MESSAGES.IMAGE_GENERATION_FAILED);
  };
  image.src = url;
}

function downloadSVG() {
  const svg = document.querySelector('#output svg');
  if (!svg) {
    showError(ERROR_MESSAGES.NO_SVG_GENERATED);
    return;
  }
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  downloadFile(svgString, FILE_NAMES.LOGIC_MODEL_SVG, MIME_TYPES.SVG);
}
