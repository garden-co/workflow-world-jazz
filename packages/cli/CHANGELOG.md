# @vercel/workflow-cli

## 0.0.1-alpha.35

### Patch Changes

- Updated dependencies [544055f]
  - @vercel/workflow-core@0.0.1-alpha.26

## 0.0.1-alpha.34

### Patch Changes

- e275561: Refactor world selection logic in core, and unify with CLI use. Polish pagination. Refactor logging.
- Updated dependencies [e275561]
  - @vercel/workflow-world-embedded@0.0.1-alpha.3
  - @vercel/workflow-core@0.0.1-alpha.25

## 0.0.1-alpha.33

### Patch Changes

- a946b38: Remove "workflow:step" export condition
- 72fb2c1: CLI: allow specifying team/project IDs for vercel bcakend, and infer them if not specified. Rename --target option to --backend.
- 5fc83a5: CLI: support inspect commands against vercel backend, add login command
- 7c0f71e: CLI: Add json mode
- 345836a: Allow listing steps/streams/events without a run ID, improve table formatting, show serialized input/output
- f2168a6: Fix vercel proxy paths, add pagination
- Updated dependencies [a946b38]
- Updated dependencies [3ee71fa]
- Updated dependencies [a61eaad]
- Updated dependencies [07b3283]
- Updated dependencies [7c0f71e]
- Updated dependencies [1688890]
- Updated dependencies [d66070f]
- Updated dependencies [d808404]
- Updated dependencies [eb76cb3]
- Updated dependencies [d338144]
- Updated dependencies [345836a]
- Updated dependencies [f2168a6]
- Updated dependencies [cd4a41c]
  - @vercel/workflow-core@0.0.1-alpha.24
  - @vercel/swc-plugin-workflow@0.0.1-alpha.5
  - @vercel/workflow-world-embedded@0.0.1-alpha.2
  - @vercel/workflow-world-vercel@0.0.1-alpha.2
  - @vercel/workflow-world@0.0.1-alpha.2

## 0.0.1-alpha.32

### Patch Changes

- a85227c: Fix getStepContext and getWorkflowContext exports
- Updated dependencies [37e6ee8]
- Updated dependencies [d412985]
- Updated dependencies [f56e1e6]
- Updated dependencies [a85227c]
  - @vercel/workflow-core@0.0.1-alpha.23

## 0.0.1-alpha.31

### Patch Changes

- a5197f7: Added inspect commands to cli
- Updated dependencies [a5197f7]
  - @vercel/workflow-core@0.0.1-alpha.22

## 0.0.1-alpha.30

### Patch Changes

- 757e454: Disable custom swcrc configs for our transform
- Updated dependencies [d4914d7]
- Updated dependencies [8ed4fb6]
- Updated dependencies [705e63c]
  - @vercel/workflow-core@0.0.1-alpha.21

## 0.0.1-alpha.29

### Patch Changes

- 779989f: bug: ignore generated .well-known directories
- 45671a4: Disable un-used sourcemap handling and tweak logs with timings'
- Updated dependencies [9dbb1c9]
  - @vercel/workflow-core@0.0.1-alpha.20

## 0.0.1-alpha.28

### Patch Changes

- 5014b6d: Implement dev watcher for Next.js builder
- cf2979d: Add MIT License
- 0a10773: Changed workflow API routes from /api/generated to /.well-known/workflow/v1
- Updated dependencies [c78c8fa]
- Updated dependencies [b152b35]
- Updated dependencies [ec41c3c]
- Updated dependencies [cf2979d]
- Updated dependencies [0a10773]
  - @vercel/workflow-core@0.0.1-alpha.19
  - @vercel/swc-plugin-workflow@0.0.1-alpha.4

## 0.0.1-alpha.27

### Patch Changes

- ae0cbc0: Wire in external packagese from config

## 0.0.1-alpha.26

### Patch Changes

- 91190f3: Fix `get-context` with externalizing handling in Next.js
- 2c52144: Add comprehensive esbuild error and warning logging to CLI builds
- Updated dependencies [5d04853]
  - @vercel/workflow-core@0.0.1-alpha.18

## 0.0.1-alpha.25

### Patch Changes

- Updated dependencies [c7f0d52]
  - @vercel/workflow-core@0.0.1-alpha.17

## 0.0.1-alpha.24

### Patch Changes

- d3fe4ea: Add linter suppressions to generated files and auto-create .swc/.gitignore

## 0.0.1-alpha.23

### Patch Changes

- e9c1c72: Tweak bundling logic to handle more cases
- be67661: Add debug meta files for step/workflow bundles'
- b35f5f8: move the route debug logging earlier
- Updated dependencies [0b2ac90]
- Updated dependencies [7e1e4cf]
  - @vercel/workflow-core@0.0.1-alpha.16

## 0.0.1-alpha.22

### Patch Changes

- ff71d4d: Rework bundling steps and discovering workflows

## 0.0.1-alpha.21

### Patch Changes

- d19b423: Update core to use new workflow server implementation
- Updated dependencies [a88eeba]
- Updated dependencies [d19b423]
  - @vercel/workflow-core@0.0.1-alpha.15

## 0.0.1-alpha.20

### Patch Changes

- Updated dependencies [94ee3b3]
  - @vercel/workflow-core@0.0.1-alpha.14

## 0.0.1-alpha.19

### Patch Changes

- Updated dependencies [1b3dd56]
- Updated dependencies [54d1ec1]
- Updated dependencies [de9b26d]
  - @vercel/workflow-core@0.0.1-alpha.13

## 0.0.1-alpha.18

### Patch Changes

- 265c34e: Support Next.js apps using the `--turbopack` flag
- Updated dependencies [265c34e]
  - @vercel/workflow-core@0.0.1-alpha.12

## 0.0.1-alpha.17

### Patch Changes

- Updated dependencies [aff52c1]
- Updated dependencies [06b74d2]
  - @vercel/workflow-core@0.0.1-alpha.11

## 0.0.1-alpha.16

### Patch Changes

- c791360: Add generated config for Next.js builder
- Updated dependencies [b8b39e7]
- Updated dependencies [326d01f]
- Updated dependencies [2f5b253]
- Updated dependencies [5a0e901]
- Updated dependencies [1fed112]
  - @vercel/workflow-core@0.0.1-alpha.10

## 0.0.1-alpha.15

### Patch Changes

- Updated dependencies [3a342bb]
- Updated dependencies [12cb3fb]
- Updated dependencies [954b621]
- Updated dependencies [bf0c666]
- Updated dependencies [64cf6f1]
- Updated dependencies [bf51020]
- Updated dependencies [466cb68]
- Updated dependencies [49bf2a5]
  - @vercel/workflow-core@0.0.1-alpha.9

## 0.0.1-alpha.14

### Patch Changes

- dbb6973: Skip bundling workflow output for Next.js

## 0.0.1-alpha.13

### Patch Changes

- 84d7162: Update regex for externals handling

## 0.0.1-alpha.12

### Patch Changes

- fe2a430: Fix dynamic require breaking webpack bundling
- Updated dependencies [ab7185e]
  - @vercel/workflow-core@0.0.1-alpha.8

## 0.0.1-alpha.11

### Patch Changes

- Updated dependencies [cabc890]
  - @vercel/swc-plugin-workflow@0.0.1-alpha.3

## 0.0.1-alpha.10

### Patch Changes

- 6cd62d1: Switch to neutral target for workflow bundle
- Updated dependencies [4c4d406]
- Updated dependencies [0b462ea]
- Updated dependencies [47e0ca9]
  - @vercel/workflow-core@0.0.1-alpha.7
  - @vercel/swc-plugin-workflow@0.0.1-alpha.2

## 0.0.1-alpha.9

### Patch Changes

- ca3cffd: Rework .node external handling
- 76f83a9: Mark `.node` files as external during esbuild bundling process for step functions
- Updated dependencies [60f4152]
  - @vercel/workflow-core@0.0.1-alpha.6

## 0.0.1-alpha.8

### Patch Changes

- Updated dependencies [af3ca11]
  - @vercel/workflow-core@0.0.1-alpha.5

## 0.0.1-alpha.7

### Patch Changes

- 950d262: Enable "workflow" and "workflow:step" exports conditions for bundling
- Updated dependencies [0d96052]
- Updated dependencies [950d262]
  - @vercel/workflow-core@0.0.1-alpha.4

## 0.0.1-alpha.6

### Patch Changes

- Updated dependencies [030e899]
  - @vercel/swc-plugin-workflow@0.0.1-alpha.1

## 0.0.1-alpha.5

### Patch Changes

- b8159cf: Change workflow queue names
- Updated dependencies [b8159cf]
  - @vercel/workflow-core@0.0.1-alpha.3

## 0.0.1-alpha.4

### Patch Changes

- fe08f3e: NextJS ESM Builds

## 0.0.1-alpha.3

### Patch Changes

- Rebuild packages
- Updated dependencies
  - @vercel/workflow-core@0.0.1-alpha.2

## 0.0.1-alpha.2

### Patch Changes

- ce2dae6: rename route.js to route.cjs as it's a commonjs file
- Updated dependencies [b45e33b]
- Updated dependencies [e49500b]
  - @vercel/workflow-core@0.0.1-alpha.1

## 0.0.1-alpha.1

### Patch Changes

- cb64dcc: Support src/app directory in next loader

## 0.0.1-alpha.0

### Patch Changes

- Initial Release
- Updated dependencies
  - @vercel/swc-plugin-workflow@0.0.1-alpha.0
  - @vercel/workflow-core@0.0.1-alpha.0
