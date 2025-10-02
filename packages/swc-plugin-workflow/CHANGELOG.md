# @vercel/swc-plugin-workflow

## 0.0.1-alpha.5

### Patch Changes

- 1688890: special case builtin step IDs in transform
- d338144: Update SWC transform to use unique IDs and no longer wrap with `start()`

  - Workflow functions now have a unique `workflowId` field
  - Step functions also are now registered with unique id.
  - `registerStepFunction` now takes the step ID as the first argument and the function as the second argument
  - `start()` runtime method only accepts the literal workflow function now instead of a workflow "name" since it uses an internal ID the transform creates

## 0.0.1-alpha.4

### Patch Changes

- cf2979d: Add MIT License

## 0.0.1-alpha.3

### Patch Changes

- cabc890: Recursive Dead Code Elimination

## 0.0.1-alpha.2

### Patch Changes

- 47e0ca9: Throw compiler errors on non-async steps and workflows

## 0.0.1-alpha.1

### Patch Changes

- 030e899: Dead code elimination v1

## 0.0.1-alpha.0

### Patch Changes

- Initial Release
