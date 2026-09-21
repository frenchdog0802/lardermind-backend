# Task 05: pantry-vision recognize route

`POST /api/pantry-vision/recognize` — multipart, quota, OpenAI via Gateway.

## Acceptance

- [ ] Mounted in `index.ts`
- [ ] 503 if no OpenAI key; 403 on quota; 400 bad image
