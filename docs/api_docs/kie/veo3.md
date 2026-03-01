Kie Veo 3.1 API notes

Source pages checked on 2026-03-01:
- https://docs.kie.ai/veo3-api/generate-veo-3-video
- https://docs.kie.ai/veo3-api/get-veo-3-video-details

Generate endpoint:
- POST https://api.kie.ai/api/v1/veo/generate

Status endpoint:
- GET https://api.kie.ai/api/v1/veo/record-info?taskId=...

Generate request fields used by this app:
- prompt
- imageUrls
- model: veo3 or veo3_fast
- aspect_ratio
- generationType
- enableTranslation
- callBackUrl
- seeds
- watermark

Documented generationType values:
- TEXT_2_VIDEO
- FIRST_AND_LAST_FRAMES_2_VIDEO
- REFERENCE_2_VIDEO

Documented status response fields:
- data.successFlag
- data.errorMessage
- data.response.resultUrls

Documented successFlag meanings:
- 0 generating
- 1 success
- 2 failed
- 3 generation failed

Implementation note:
- Older code used /api/v1/veo/taskInfo with taskStatus/taskResult fields.
- Current docs use /api/v1/veo/record-info with successFlag/response/errorMessage.
