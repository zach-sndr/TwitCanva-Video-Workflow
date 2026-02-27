# Agent Instructions

## NodeControls Option Policy

- For `NodeControls`, expose only options that are actually supported by the active provider/model API.
- Do not invent, force, or hardcode additional options that are not part of the selected model's supported set.
- If a model/provider supports `Auto` for a setting (aspect ratio, resolution, etc.), `Auto` must remain available for that model/mode.
