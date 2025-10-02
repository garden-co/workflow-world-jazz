# @vercel/workflow-core

## 0.0.1-alpha.26

### Patch Changes

- 544055f: Add pid-port dependency for embedded world

## 0.0.1-alpha.25

### Patch Changes

- e275561: Refactor world selection logic in core, and unify with CLI use. Polish pagination. Refactor logging.
- Updated dependencies [e275561]
  - @vercel/workflow-world-embedded@0.0.1-alpha.3

## 0.0.1-alpha.24

### Patch Changes

- a946b38: Remove "workflow:step" export condition
- 3ee71fa: Export fetch directly from workflow packages
- a61eaad: Fix `@link` docs imports
- 07b3283: standardize prefixes in embedded world
- 7c0f71e: CLI: Add json mode
- d66070f: Rename `StepsNotRunError` to `WorkflowSuspension`
- d808404: Fix export for get-webhook
- eb76cb3: Remove workflow context properties from `getStepContext()` to use `getWorkflowContext()` instead
- 345836a: Allow listing steps/streams/events without a run ID, improve table formatting, show serialized input/output
- f2168a6: Fix vercel proxy paths, add pagination
- cd4a41c: extract "world" interface packages
- Updated dependencies [cd4a41c]
  - @vercel/workflow-world-embedded@0.0.1-alpha.2
  - @vercel/workflow-world-vercel@0.0.1-alpha.2
  - @vercel/workflow-world@0.0.1-alpha.2

## 0.0.1-alpha.23

### Patch Changes

- 37e6ee8: Rename `createWorkflowOutputStream` to `getWorkflowWritableStream`, and `getWorkflowOutputStream` to `getWorkflowReadableStream`
- d412985: remove http status code from step retry
- f56e1e6: Fully use export condition for workflow versus step
- a85227c: Fix getStepContext and getWorkflowContext exports

## 0.0.1-alpha.22

### Patch Changes

- a5197f7: Added inspect commands to cli

## 0.0.1-alpha.21

### Patch Changes

- d4914d7: Split getContext into getWorkflowContext and getStepContext
- 8ed4fb6: Add support for `startIndex` option in `getWorkflowOutputStream()`
- 705e63c: extend sleep to use an end date

## 0.0.1-alpha.20

### Patch Changes

- 9dbb1c9: create an embedded backend for the embedded world

  a `World` now consists of the following sub-interfaces:

  - Queue (how do we queue jobs?)
  - Storage (how do we store data?)
  - Streamer (how do we stream data?)
  - AuthProvider (grabbing auth info, this is questionable though, might be removed later)

  There are two `World` implementations provided in `core`:

  - `Vercel` is used when `process.env.VERCEL_DEPLOYMENT_ID` exists. It communicates with the Vercel Workflow Server for storage and streaming, and using Vercel Queue for queuing jobs.
  - `Embedded` is used otherwise. It uses ephemeral filesystem for storage and streaming, and a local embedded in-memory queue implementation.

## 0.0.1-alpha.19

### Patch Changes

- c78c8fa: Improve workflow logging
- b152b35: Optimize `URLSearchParams` serialization
- ec41c3c: Enable implicitly associated output stream to workflow runs (added `createWorkflowOutputStream()` and `getWorkflowOutputStream()`)
- cf2979d: Add MIT License
- 0a10773: Changed workflow API routes from /api/generated to /.well-known/workflow/v1
- Updated dependencies [cf2979d]
  - @vercel/workflow-vm@0.0.1-alpha.4

## 0.0.1-alpha.18

### Patch Changes

- 5d04853: Change default max retries from 32 to 3 for workflow steps

## 0.0.1-alpha.17

### Patch Changes

- c7f0d52: Use `world.getDeploymentId()` more consistently to fix local dev

## 0.0.1-alpha.16

### Patch Changes

- 0b2ac90: Set the `deploymentId` option in vqs `send()`
- 7e1e4cf: Export WebhookOptions type

## 0.0.1-alpha.15

### Patch Changes

- a88eeba: automatic oidc token refresh (using newer @vercel/oidc package)
- d19b423: Update core to use new workflow server implementation

## 0.0.1-alpha.14

### Patch Changes

- 94ee3b3: embedded server: use process.env.PORT if exists

## 0.0.1-alpha.13

### Patch Changes

- 1b3dd56: allow to configure the server port. otherwise, a port exposed from the current pid will be used.

  The configuration is done by using a stringified JSON in env vars.

  In case the port is not assigned, we will try to grab the port from the pids,
  and will choose the lowest exposed port, assuming random ports are in the 5-digit range--while the main server ports are usually in the 4-digit range like 3000.

- 54d1ec1: Use `run()` instead of `enterWith()` for AsyncLocalStorage
- de9b26d: Make `pid-port` be a regular dependency

## 0.0.1-alpha.12

### Patch Changes

- 265c34e: Use `@vercel/oidc` package for retrieving the OIDC token information (instead of `@vercel/functions`)

## 0.0.1-alpha.11

### Patch Changes

- aff52c1: Add initial readme instructions
- 06b74d2: Run e2e tests in parallel

## 0.0.1-alpha.10

### Patch Changes

- b8b39e7: Add `stepStartedAt` to `getContext()`
- 326d01f: Re-introduce `sleep()` function
- 2f5b253: Remove 2 second sleep in `start()` function
- 5a0e901: Add OpenTelemetry trace propagation to webhook processing
- 1fed112: Add `@__PURE__` annotation to `contextStorage`

## 0.0.1-alpha.9

### Patch Changes

- 3a342bb: Implement "named webhooks"
- 12cb3fb: Rename useContext to getContext
- 954b621: Make `getWorkflowReturnValue()` return more meaningful errors
- bf0c666: Bail gracefully when a step completes after the workflow has already finished
- 64cf6f1: Add getWorkflowReturnValue
- bf51020: Use `function` instead of arrow syntax for exported functions
- 466cb68: Rename `useWebhook()` to `getWebhook()`
- 49bf2a5: Add OpenTelemetry tracing
- Updated dependencies [b34c907]
  - @vercel/workflow-vm@0.0.1-alpha.3

## 0.0.1-alpha.8

### Patch Changes

- ab7185e: Implement `useWebhook()`

## 0.0.1-alpha.7

### Patch Changes

- 4c4d406: Return from workflow run unless status is "running"
- 0b462ea: add embedded queue system that can be used with an env var

## 0.0.1-alpha.6

### Patch Changes

- 60f4152: Serialize `Error` instances

## 0.0.1-alpha.5

### Patch Changes

- af3ca11: Add `RetryableError`

## 0.0.1-alpha.4

### Patch Changes

- 0d96052: Finish serialization/deserialization logic
- 950d262: Implement `useContext()`
- Updated dependencies [0d96052]
  - @vercel/workflow-vm@0.0.1-alpha.2

## 0.0.1-alpha.3

### Patch Changes

- b8159cf: Change workflow queue names

## 0.0.1-alpha.2

### Patch Changes

- Rebuild packages
- Updated dependencies
  - @vercel/workflow-vm@0.0.1-alpha.1

## 0.0.1-alpha.1

### Patch Changes

- b45e33b: Log `step_failure` events for retryable errors
- e49500b: Prevent multiple steps being created with same `invocation_id`

## 0.0.1-alpha.0

### Patch Changes

- Initial Release
- Updated dependencies
  - @vercel/workflow-vm@0.0.1-alpha.0
