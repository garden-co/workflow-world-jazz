# @vercel/workflow-next

## 0.0.1-alpha.36

### Patch Changes

- Updated dependencies [544055f]
  - @vercel/workflow-core@0.0.1-alpha.26
  - @vercel/workflow-cli@0.0.1-alpha.35

## 0.0.1-alpha.35

### Patch Changes

- e275561: Refactor world selection logic in core, and unify with CLI use. Polish pagination. Refactor logging.
- Updated dependencies [e275561]
  - @vercel/workflow-core@0.0.1-alpha.25
  - @vercel/workflow-cli@0.0.1-alpha.34

## 0.0.1-alpha.34

### Patch Changes

- Updated dependencies [a946b38]
- Updated dependencies [72fb2c1]
- Updated dependencies [3ee71fa]
- Updated dependencies [a61eaad]
- Updated dependencies [07b3283]
- Updated dependencies [5fc83a5]
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
  - @vercel/workflow-cli@0.0.1-alpha.33
  - @vercel/swc-plugin-workflow@0.0.1-alpha.5

## 0.0.1-alpha.33

### Patch Changes

- Updated dependencies [37e6ee8]
- Updated dependencies [d412985]
- Updated dependencies [f56e1e6]
- Updated dependencies [a85227c]
  - @vercel/workflow-core@0.0.1-alpha.23
  - @vercel/workflow-cli@0.0.1-alpha.32

## 0.0.1-alpha.32

### Patch Changes

- Updated dependencies [a5197f7]
  - @vercel/workflow-core@0.0.1-alpha.22
  - @vercel/workflow-cli@0.0.1-alpha.31

## 0.0.1-alpha.31

### Patch Changes

- Updated dependencies [d4914d7]
- Updated dependencies [8ed4fb6]
- Updated dependencies [705e63c]
- Updated dependencies [757e454]
  - @vercel/workflow-core@0.0.1-alpha.21
  - @vercel/workflow-cli@0.0.1-alpha.30

## 0.0.1-alpha.30

### Patch Changes

- 94567d1: Fix initial workflow bundles build with latest canary
- 9dbb1c9: create an embedded backend for the embedded world

  a `World` now consists of the following sub-interfaces:

  - Queue (how do we queue jobs?)
  - Storage (how do we store data?)
  - Streamer (how do we stream data?)
  - AuthProvider (grabbing auth info, this is questionable though, might be removed later)

  There are two `World` implementations provided in `core`:

  - `Vercel` is used when `process.env.VERCEL_DEPLOYMENT_ID` exists. It communicates with the Vercel Workflow Server for storage and streaming, and using Vercel Queue for queuing jobs.
  - `Embedded` is used otherwise. It uses ephemeral filesystem for storage and streaming, and a local embedded in-memory queue implementation.

- Updated dependencies [779989f]
- Updated dependencies [45671a4]
- Updated dependencies [9dbb1c9]
  - @vercel/workflow-cli@0.0.1-alpha.29
  - @vercel/workflow-core@0.0.1-alpha.20

## 0.0.1-alpha.29

### Patch Changes

- beb8848: Fix build showing port error and workflow rebuilding with next start
- 5014b6d: Implement dev watcher for Next.js builder
- cf2979d: Add MIT License
- Updated dependencies [c78c8fa]
- Updated dependencies [b152b35]
- Updated dependencies [ec41c3c]
- Updated dependencies [5014b6d]
- Updated dependencies [cf2979d]
- Updated dependencies [0a10773]
  - @vercel/workflow-core@0.0.1-alpha.19
  - @vercel/workflow-cli@0.0.1-alpha.28
  - @vercel/swc-plugin-workflow@0.0.1-alpha.4

## 0.0.1-alpha.28

### Patch Changes

- eb7625c: Fix dev env not set in time for webpack
- c7eab04: Upgrade next to 15.5.3
- Updated dependencies [ae0cbc0]
  - @vercel/workflow-cli@0.0.1-alpha.27

## 0.0.1-alpha.27

### Patch Changes

- Updated dependencies [5d04853]
- Updated dependencies [91190f3]
- Updated dependencies [2c52144]
  - @vercel/workflow-core@0.0.1-alpha.18
  - @vercel/workflow-cli@0.0.1-alpha.26

## 0.0.1-alpha.26

### Patch Changes

- Updated dependencies [c7f0d52]
  - @vercel/workflow-core@0.0.1-alpha.17
  - @vercel/workflow-cli@0.0.1-alpha.25

## 0.0.1-alpha.25

### Patch Changes

- Updated dependencies [d3fe4ea]
  - @vercel/workflow-cli@0.0.1-alpha.24

## 0.0.1-alpha.24

### Patch Changes

- Updated dependencies [0b2ac90]
- Updated dependencies [e9c1c72]
- Updated dependencies [be67661]
- Updated dependencies [b35f5f8]
- Updated dependencies [7e1e4cf]
  - @vercel/workflow-core@0.0.1-alpha.16
  - @vercel/workflow-cli@0.0.1-alpha.23

## 0.0.1-alpha.23

### Patch Changes

- ff71d4d: Rework bundling steps and discovering workflows
- Updated dependencies [ff71d4d]
  - @vercel/workflow-cli@0.0.1-alpha.22

## 0.0.1-alpha.22

### Patch Changes

- 8a80797: Docs: add more troubleshooting instructions
- d19b423: Update core to use new workflow server implementation
- Updated dependencies [a88eeba]
- Updated dependencies [d19b423]
  - @vercel/workflow-core@0.0.1-alpha.15
  - @vercel/workflow-cli@0.0.1-alpha.21

## 0.0.1-alpha.21

### Patch Changes

- d2ef1dd: Add troubleshooting doc for external package
- Updated dependencies [94ee3b3]
  - @vercel/workflow-core@0.0.1-alpha.14
  - @vercel/workflow-cli@0.0.1-alpha.20

## 0.0.1-alpha.20

### Patch Changes

- 1b3dd56: add nextConfig.workflows.embedded that will be propagated as an env var to the embedded workflow world
- Updated dependencies [1b3dd56]
- Updated dependencies [54d1ec1]
- Updated dependencies [de9b26d]
  - @vercel/workflow-core@0.0.1-alpha.13
  - @vercel/workflow-cli@0.0.1-alpha.19

## 0.0.1-alpha.19

### Patch Changes

- 265c34e: Support Next.js apps using the `--turbopack` flag
- Updated dependencies [265c34e]
- Updated dependencies [265c34e]
  - @vercel/workflow-core@0.0.1-alpha.12
  - @vercel/workflow-cli@0.0.1-alpha.18

## 0.0.1-alpha.18

### Patch Changes

- aff52c1: Add initial readme instructions
- Updated dependencies [aff52c1]
- Updated dependencies [06b74d2]
  - @vercel/workflow-core@0.0.1-alpha.11
  - @vercel/workflow-cli@0.0.1-alpha.17

## 0.0.1-alpha.17

### Patch Changes

- Updated dependencies [c791360]
- Updated dependencies [b8b39e7]
- Updated dependencies [326d01f]
- Updated dependencies [2f5b253]
- Updated dependencies [5a0e901]
- Updated dependencies [1fed112]
  - @vercel/workflow-cli@0.0.1-alpha.16
  - @vercel/workflow-core@0.0.1-alpha.10

## 0.0.1-alpha.16

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
  - @vercel/workflow-cli@0.0.1-alpha.15

## 0.0.1-alpha.15

### Patch Changes

- 3bb72a8: Always set embedded env for Next.js'

## 0.0.1-alpha.14

### Patch Changes

- d9d7863: Only run workflow build once in Next.js
- Updated dependencies [dbb6973]
  - @vercel/workflow-cli@0.0.1-alpha.14

## 0.0.1-alpha.13

### Patch Changes

- Updated dependencies [84d7162]
  - @vercel/workflow-cli@0.0.1-alpha.13

## 0.0.1-alpha.12

### Patch Changes

- Updated dependencies [fe2a430]
- Updated dependencies [ab7185e]
  - @vercel/workflow-cli@0.0.1-alpha.12
  - @vercel/workflow-core@0.0.1-alpha.8

## 0.0.1-alpha.11

### Patch Changes

- Updated dependencies [cabc890]
  - @vercel/swc-plugin-workflow@0.0.1-alpha.3
  - @vercel/workflow-cli@0.0.1-alpha.11

## 0.0.1-alpha.10

### Patch Changes

- 0b462ea: automatically use embedded queue service on `next dev` and `next start`
- Updated dependencies [4c4d406]
- Updated dependencies [0b462ea]
- Updated dependencies [6cd62d1]
- Updated dependencies [47e0ca9]
  - @vercel/workflow-core@0.0.1-alpha.7
  - @vercel/workflow-cli@0.0.1-alpha.10
  - @vercel/swc-plugin-workflow@0.0.1-alpha.2

## 0.0.1-alpha.9

### Patch Changes

- ca3cffd: Rework .node external handling
- 76f83a9: Mark `.node` files as external during esbuild bundling process for step functions
- Updated dependencies [60f4152]
- Updated dependencies [ca3cffd]
- Updated dependencies [76f83a9]
  - @vercel/workflow-core@0.0.1-alpha.6
  - @vercel/workflow-cli@0.0.1-alpha.9

## 0.0.1-alpha.8

### Patch Changes

- Updated dependencies [af3ca11]
  - @vercel/workflow-core@0.0.1-alpha.5
  - @vercel/workflow-cli@0.0.1-alpha.8

## 0.0.1-alpha.7

### Patch Changes

- Updated dependencies [0d96052]
- Updated dependencies [950d262]
- Updated dependencies [950d262]
  - @vercel/workflow-core@0.0.1-alpha.4
  - @vercel/workflow-cli@0.0.1-alpha.7

## 0.0.1-alpha.6

### Patch Changes

- Updated dependencies [030e899]
  - @vercel/swc-plugin-workflow@0.0.1-alpha.1
  - @vercel/workflow-cli@0.0.1-alpha.6

## 0.0.1-alpha.5

### Patch Changes

- Updated dependencies [b8159cf]
  - @vercel/workflow-core@0.0.1-alpha.3
  - @vercel/workflow-cli@0.0.1-alpha.5

## 0.0.1-alpha.4

### Patch Changes

- Updated dependencies [fe08f3e]
  - @vercel/workflow-cli@0.0.1-alpha.4

## 0.0.1-alpha.3

### Patch Changes

- Rebuild packages
- Updated dependencies
  - @vercel/workflow-cli@0.0.1-alpha.3
  - @vercel/workflow-core@0.0.1-alpha.2

## 0.0.1-alpha.2

### Patch Changes

- Updated dependencies [ce2dae6]
- Updated dependencies [b45e33b]
- Updated dependencies [e49500b]
  - @vercel/workflow-cli@0.0.1-alpha.2
  - @vercel/workflow-core@0.0.1-alpha.1

## 0.0.1-alpha.1

### Patch Changes

- cb64dcc: Support src/app directory in next loader
- Updated dependencies [cb64dcc]
  - @vercel/workflow-cli@0.0.1-alpha.1

## 0.0.1-alpha.0

### Patch Changes

- Initial Release
- Updated dependencies
  - @vercel/swc-plugin-workflow@0.0.1-alpha.0
  - @vercel/workflow-cli@0.0.1-alpha.0
  - @vercel/workflow-core@0.0.1-alpha.0
