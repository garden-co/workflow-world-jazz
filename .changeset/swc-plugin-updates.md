---
"@vercel/swc-plugin-workflow": patch
---

Update SWC transform to use unique IDs and no longer wrap with `start()`

- Workflow functions now have a unique `workflowId` field
- Step functions also are now registered with unique id.
- `registerStepFunction` now takes the step ID as the first argument and the function as the second argument
- `start()` runtime method only accepts the literal workflow function now instead of a workflow "name" since it uses an internal ID the transform creates
