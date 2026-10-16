# Task 50–51: Allergy retention + fuzz prompt contracts

**Depends on:** Decision #6 for allergy mandate; fuzz can start earlier  
**Repo:** `backend-cf/`

## Goal

Prompt (+ optional light guard): getPreferences before plan; refuse non-food pantry; empty pantry honesty; 100-day → disclose truncate/cap.

## Acceptance

- [ ] system-prompt tests cover new wording
- [ ] No false claim of 100 scheduled dinners without truncate

## Test

```bash
cd backend-cf && npm test -- system-prompt
```
