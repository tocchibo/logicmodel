function downloadPNG() {
  const svg = document.querySelector('#output svg');
  if (!svg) {
    alert('ロジックモデルが生成されていません');
    return;
  }

  const serializer = new XMLSerializer();
  const svgData = serializer.serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.onload = () => {
    const padding = 40;
    const canvas = document.createElement("canvas");
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + padding * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, padding, padding);
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "logic_model.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    alert('画像の生成に失敗しました');
  };
  image.src = url;
}

function downloadSVG() {
  const svg = document.querySelector('#output svg');
  if (!svg) {
    alert('ロジックモデルが生成されていません');
    return;
  }
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "logic_model.svg";
  a.click();
  URL.revokeObjectURL(url);
}
