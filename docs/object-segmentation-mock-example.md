# Object Segmentation Mock Example

下面是一个最小可用的 mock 服务返回示例。任何后端语言都可以照这个协议实现。

## Mock Request

```json
{
  "image": "data:image/png;base64,...",
  "imageWidth": 1024,
  "imageHeight": 1024,
  "click": { "x": 512, "y": 430 },
  "mode": "point-segmentation"
}
```

## Mock Response

```json
{
  "label": "candidate-object",
  "score": 0.81,
  "bbox": {
    "x": 392,
    "y": 318,
    "width": 240,
    "height": 220
  },
  "polygon": [
    { "x": 405, "y": 330 },
    { "x": 620, "y": 324 },
    { "x": 628, "y": 522 },
    { "x": 414, "y": 536 }
  ],
  "maskUrl": "https://example.com/mock-mask.png",
  "details": "mock segmentation response"
}
```

## Node / Express pseudo code

```ts
app.post('/detect', async (req, res) => {
  const { imageWidth, imageHeight, click } = req.body;

  const width = Math.max(96, Math.round(imageWidth * 0.24));
  const height = Math.max(96, Math.round(imageHeight * 0.22));
  const x = Math.max(0, Math.min(click.x - width / 2, imageWidth - width));
  const y = Math.max(0, Math.min(click.y - height / 2, imageHeight - height));

  res.json({
    label: 'candidate-object',
    score: 0.81,
    bbox: { x, y, width, height },
    polygon: [
      { x: x + 10, y: y + 8 },
      { x: x + width - 10, y: y + 4 },
      { x: x + width - 4, y: y + height - 8 },
      { x: x + 12, y: y + height - 2 }
    ],
    maskUrl: 'https://example.com/mock-mask.png',
    details: 'mock segmentation response'
  });
});
```

## 接入方式

在 `.env.local` 里配置：

```env
OBJECT_DETECTION_PROVIDER=sam
OBJECT_SEGMENTATION_ENDPOINT=http://127.0.0.1:8080/detect
OBJECT_SEGMENTATION_TIMEOUT_MS=20000
```

配置后，`/api/detect-object` 会优先调用这个 mock / 真分割服务。
