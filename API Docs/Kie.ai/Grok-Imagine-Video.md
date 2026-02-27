# Kie.ai - Grok Imagine Video

## Official docs
- Text to Video: https://docs.kie.ai/market/grok-imagine/text-to-video.md
- Image to Video: https://docs.kie.ai/market/grok-imagine/image-to-video.md
- T2V OpenAPI: https://docs.kie.ai/market/grok-imagine/text-to-video.json
- I2V OpenAPI: https://docs.kie.ai/market/grok-imagine/image-to-video.json

## Endpoint
- `POST https://api.kie.ai/api/v1/jobs/createTask`

## Models
- `grok-imagine/text-to-video`
- `grok-imagine/image-to-video`

## Input fields used in AI-Canvas
- `prompt`: string
- `mode`: `fun` | `normal` | `spicy`
- `duration`: `"6" | "10"`
- `resolution`: `"480p" | "720p"`
- `aspect_ratio` (T2V only): `"2:3" | "3:2" | "1:1" | "16:9" | "9:16"`
- `image_urls` (I2V only): string[] (single URL)

## Frontend model IDs in this repo
- `kie-grok-imagine-text-to-video` -> `grok-imagine/text-to-video`
- `kie-grok-imagine-image-to-video` -> `grok-imagine/image-to-video`

## Notes
- Query status/results: `GET /api/v1/jobs/recordInfo?taskId=...`
- I2V spicy mode can be restricted for external image URLs in Kie docs; if errors occur, retry with `normal`.
