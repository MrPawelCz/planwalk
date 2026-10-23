---
name: The AI misread my plan
about: The JSON from your AI does not match the drawing (missing rooms, wrong scale, walls in the wrong place)
labels: reading-quality
---

**Which AI and mode did you use?** (chat model name, or the agent skill, and its version)

**What went wrong?** (missing walls, wrong scale, extra rooms, mirrored plan, doors in the wrong place)

**The drawing** (attach it only if you are allowed to share it; a cropped or redrawn version is fine; otherwise describe its style: CAD PDF, brochure image, hand sketch, photo)

**The JSON** (paste it, or attach plan.json)

**Validator output** (`node tools/validate.mjs plan.json` or the viewer's issue panel)

**What you tried** (the "Copy fix request" loop, a different prompt, a different model)
