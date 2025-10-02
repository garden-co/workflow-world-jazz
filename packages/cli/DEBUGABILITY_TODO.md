# CLI and D11y deliverables

## PR 1 - Basic CLI for embedded worlds

Make functions from workflow/core "world" API available to the CLI package for simple text-based interactions.

- [x] Basic CLI commands (list runs, steps, streams, events)
- [x] Scan for a .next folder, and if so, use `.next/workflow-data` as the data dir, otherwise use `.workflow-data`, to make the CLI work with the embedded world
- [x] Don't require PORT definition in the embedded world config, since we're read-only

## PR 2/3 - Support access to vercel world, infer context

- [x] Add explicit `--target [vercel/embedded]` (defaults to `embedded`) to set the world
- [x] Support `--env production` flag (defaults to `production`) 
  - [ ] Support non-production environments (where to grab the token from?)
- [x] When using vercel world, scan and grab API token created by `vercel/vercel` CLI
  - Copied logic from `@vercel/sandbox-sdk`
- [x] Ensure the vercel world CLI works against a deployed version of the nextjs-turbopack example app
- [x] Allow passing team/project scopes for vercel backend, send as headers
  - Later on, vercel queues should support the same auth, so CLI can directly interface with queues
    - Actually, do we? TBD
- [x] Infer team/project scopes by scanning the `.vercel` folder if available
- ~On `workflow-server:lib/auth` accept Vercel-CLI style token~
  - Verify that separately to extract owner IDs
  - Accept HTTP headers for specifying project and team
- [ ] Create a proxy as the vercel backend target that handles token auth and
  internally proxies to workflow-server, to handle the above auth

## PR 4 - E2E tests and polish

- [x] Add basic e2e tests to ensure CLI can be invoked and returns content
- [ ] Add tests for vercel backend
  - Partially done, but waiting for proxy mentioned above
- [x] Add CLI argument to allow proxy path (--host)
- [x] Add check for deployment URL to see if localhost, if so, set `--backend=vercel` and set deployment URL correctly
- [ ] Add JSON flag support

## PR 5 - CLI command polish

- [x] Add help text for commands
- [x] Ensure list/show calls for all resources are nicely formatted
- [x] Serialize I/O for runs/steps correctly
- [x] Ensure streams are stubbed and separately accessible
- [x] Ensure following a stream live streams to console until stream close
  - Should also work with JSON mode (JSONL / NDJSON)
- [x] Detect environment (vercel hosted vs. vercel non-hosted) and set proxy URL accordingly
- [x] Ensure JSON output has no other polluting output and works well with e.g. `jq`
- [x] Print timestamps relative to user time unless in JSON mode
- [x] Ensure embedded world uses ID prefixes (https://github.com/vercel/workflow/pull/223) 
- [x] Add simple pagination support for inspect command
- [x] Add infobox for pagination/stream/inspect help, after a table gets printed

## PR 6 - Allowing listing steps/events/streams without needing a runId
- [x] First, locally support this by doing a wide search (inefficient, don't use!)
- [x] Make PR for workflow-server to support secondary index queries and update API
  - See [branch](https://github.com/vercel/workflow-server/tree/%40pranaygp/step-get-put-without-run-id-dependency)
- [x] Extend world interface, and embedded/vercel worlds to use new rules
- [x] Update CLI code to use new API where applicable, with some performance safeguards

## PR 7 - Support `start` command and manifest
  
- [x] Improve PORT inference for embedded world
- [x] Remove "read-only" mode
- [ ] Scan workflow build manifest (maybe infer PORT, dataDir, etc. from that if available) and provide workflow definition lookup
- [x] Add start command with basic JSON input parsing (no streams)
  - Ensure there's some docs about this in the info box, easy to get wrong
- [ ] Add a getManifest method or similar to the world interface in order to retrieve valid workflow names
- [ ] Add infobox after running start for how to follow run stream / event stream / wait for output

# PR 8 - Web UI

- [ ] Add a web package that's a NextJS project depending on `workflow/core`, able to show data by accessing the world interface directly
- [ ] Take all of the args/envs that the CLI takes as query params
- [ ] CLI `wf inspect --web` should ensure web package is globally installed
  - Locally it should be linked to the neighbor package
- [ ] CLI web call should seed web UI with CLI-given variables so ensure it's accessing the same world in the same way

## TBD - not assigned a priority yet
- [ ] Add unit tests on workflow-server for checking `remoteRefBehavior: resolve` on /runs return data
- [ ] Move all the logging code to `core` and re-use in `core`
- [ ] Support `pause`/`unpause`/`cancel` commands
  - This is TBD given we don't have implementations or a complete spec for these yet
- [ ] Detect interactive mode to allow cursor capture for pagination. Reduce hints in non-interactive mode.
- [ ] Better error handling/messages for when world calls fail
- [ ] Support `wf i webhooks` to list/show webhooks
- [ ] Allow passing IDs without a resource, and infer resource type by ID
- [ ] Validate IDs passed against prefixes to show helpful warnings when the wrong IDs are being used
- [ ] Use `@vercel/auth-cli` package instead of our copied auth code, once package is released, after checking it serves our purpose.
- [ ] Allow pagination with back/forward commands
- [ ] Unify logging implementation between CLI logger and 
- [ ] Support `workflow.config.ts`
  - (Basebuilder code has a config type WorkflowConfig, which should become the workflow.config.ts, with zod schema validation, possibly copying next.js code for config parsing/setup. Next has embedded stuff, which should be part of this type)
- [ ] `wf init` command to initialize config files
- [ ] Allow embedded world to create its own NodeJS server (see vercel CLI `forkDevServer`) ([code](https://github.com/vercel/vercel/blob/main/packages/node/src/start-dev-server.ts)) for standalone example app
- [ ] Expand workbench/example app to allow the well-known endpoints to be called through workflow CLI by using the internal dev server



