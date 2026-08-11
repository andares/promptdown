# Task for delegate

Use the read tool on the image at /mnt/c/Users/andar/AppData/Local/Temp/QQ_1786432675249.png (the image will be attached). This is a screenshot of an Azure DevOps Personal Access Token creation page. Answer these specific questions: 1) List ALL visible text verbatim (labels, dropdowns, radio buttons, scopes, buttons), character by character. 2) What is the Organization field set to (is there a dropdown with "All accessible organizations" or a specific org name)? 3) What scope sections are visible (e.g. Scopes, Marketplace, Code, etc.) and what are the exact option names? 4) Is there an expiration/validity field and what options does it show? 5) Any warning banners or informational text visible? 6) What buttons are at the bottom (Create/Cancel)?

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return a concise result and residual risks when applicable

Required evidence: manual-notes, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```