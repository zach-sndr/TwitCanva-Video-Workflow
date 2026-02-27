# Kie.ai - Kling Video

## Official docs
- Kling 2.6 Text to Video: https://docs.kie.ai/market/kling/text-to-video.md
- Kling 2.6 Image to Video: https://docs.kie.ai/market/kling/image-to-video.md
- Kling 3.0: https://docs.kie.ai/market/kling/kling-3.0.md
- Kling 2.6 T2V OpenAPI: https://docs.kie.ai/market/kling/text-to-video.json
- Kling 2.6 I2V OpenAPI: https://docs.kie.ai/market/kling/image-to-video.json
- Kling 3.0 OpenAPI: https://docs.kie.ai/market/kling/kling-3.0.json

## Endpoint
- `POST https://api.kie.ai/api/v1/jobs/createTask`

## Models
- `kling-2.6/text-to-video`
- `kling-2.6/image-to-video`
- `kling-3.0/video`

## Input fields used in AI-Canvas
### Kling 2.6 Text to Video
- `prompt`: string
- `sound`: boolean
- `aspect_ratio`: `"1:1" | "16:9" | "9:16"`
- `duration`: `"5" | "10"`

### Kling 2.6 Image to Video
- `prompt`: string
- `image_urls`: string[] (single URL)
- `sound`: boolean
- `duration`: `"5" | "10"`

### Kling 3.0
- `prompt`: string
- `image_urls`: string[] (optional in single-shot mode)
- `sound`: boolean
- `duration`: `"3".."15"`
- `mode`: `"std" | "pro"`
- `multi_shots`: boolean
- `aspect_ratio`: `"16:9" | "9:16" | "1:1"`

## Frontend model IDs in this repo
- `kie-kling-2.6-text-to-video` -> `kling-2.6/text-to-video`
- `kie-kling-2.6-image-to-video` -> `kling-2.6/image-to-video`
- `kie-kling-3.0` -> `kling-3.0/video`

## Notes
- Query status/results: `GET /api/v1/jobs/recordInfo?taskId=...`
- AI-Canvas currently sends Kling 3.0 in single-shot mode with `mode: "pro"`.
