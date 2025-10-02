# Workflow CLI

A CLI tool for building and developing Vercel workflow

## Installation

Include it as a local workspace dependency directly in your package.json for now. This hasn't been published to npm and is only accessible in this workspace at the moment.

## Usage

The CLI provides both `workflow` and `wf` (shorthand) commands:

```bash
# Build workflows (main functionality)
workflow build
workflow build --target vercel-static
workflow build --target vercel-build-output-api

# Coming soon commands
workflow dev          # Development server with file watching
workflow init         # Initialize new workflow project  
workflow validate     # Validate workflow files

# Inspect runs, steps, and streams
workflow inspect runs
workflow inspect runs <run-id>
workflow inspect steps <run-id>
workflow inspect steps <run-id> <step-id>
workflow inspect streams <run-id>
workflow inspect streams <run-id> <stream-id>
```

## Commands

### `workflow build [TARGET]`

Build workflow bundles for deployment.

**Options:**

- `--target, -t` - Build target (`vercel-static` | `vercel-build-output-api`)

**Examples:**

```bash
workflow build
workflow build --target vercel-build-output-api
```

### `workflow dev` *(Coming Soon)*

Start development server with file watching, hot reloading, and enhanced debugging.

### `workflow init` *(Coming Soon)*

Initialize a new workflow project with templates and interactive setup.

### `workflow validate` *(Coming Soon)*

Validate workflow files with syntax checking, type validation, and best practice recommendations.

### `workflow inspect`

Inspect runs, steps, and streams.

**Examples:**

```bash
workflow inspect runs
# or
wf i run
```

shows:

```bash
runId                       workflowName  status     startedAt      completedAt
--------------------------  ------------  ---------  -------------  -------------
01DM34QQ1DQCDQB7Z671PME0MX  chat          completed  1758567853759  1758567864010
# ... more runs
```

For more commands and explanations, simply run `workflow inspect` without any arguments.

## Build Targets

### `vercel-static` (default)

- Creates bundles at `.well-known/workflow/v1/step.js` and `.well-known/workflow/v1/flow.js`
- Uses standard Vercel deployment process
- Functions available at `.well-known/workflow/v1/step` and `.well-known/workflow/v1/flow`

### `vercel-build-output-api`

- Creates `.vercel/output` directory structure
- Generates serverless functions at:
  - `.well-known/workflow/v1/step.func`
  - `.well-known/workflow/v1/flow.func`
- Compatible with Vercel Build Output API v3

## Configuration

The CLI looks for workflow files in the `./workflows/` directory by default. You can organize your files as:

```
workflows/
├── steps.ts       # Step definitions
├── workflows.ts   # Workflow definitions
└── utils/         # Shared utilities
```

## Development

```bash
# Build the CLI
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm watch
```
