# workflow-world-jazz

A Jazz-based World implementation for the [Workflow SDK](https://workflow.dev).

This version implements the Workflow SDK v5 World contract (spec version 8) and
requires `workflow` 5.x. For `workflow` 4.x, use `workflow-world-jazz@4.0.1-beta.1`.

You can follow these steps to try out Jazz as the backend for the [Workflow Development Kit examples](https://github.com/vercel/workflow-examples) or when building your own apps using Workflows.

## Installation

```bash
npm install workflow-world-jazz
# or
pnpm add workflow-world-jazz
# or
yarn add workflow-world-jazz
```

## Setup

### Using Jazz Cloud (recommended)

This setup uses Jazz Cloud to persist workflow state, so you only need to run & deploy your app without maintaining any extra infrastructure.

1. If you haven't already, create a free Jazz Cloud account at [https://dashboard.jazz.tools](https://dashboard.jazz.tools) and proceed with the app and environment initially created for you (or create a new app/environment in the dashboard).

2. Copy the Jazz API key displayed in the dashboard to your env vars (`.env.local` file or production env vars) and set the `WORKFLOW_TARGET_WORLD` environment variable to `workflow-world-jazz`:

    ```
    JAZZ_API_KEY=<your-app-api-key>
    WORKFLOW_TARGET_WORLD=workflow-world-jazz
    ```

3. In the dashboard, create a new worker called "Workflow Worker" and note down all the displayed credentials somewhere safe.

    Set the JAZZ_WORKER_ACCOUNT and JAZZ_WORKER_SECRET environment variables (`.env.local` file or production env vars)
    ```
    JAZZ_WORKER_ACCOUNT=<your-worker-account>
    JAZZ_WORKER_SECRET=<your-worker-secret>
    ```

4. Set up webhooks:

    - **For local development:**

        - create a local webhook registry:

            (this is necessary to call internal webhook handlers on localhost that progress the workflow)

            ```bash
            pnpx env-cmd -f .env.local -x -- pnpx jazz-run webhook create-registry --grant \$JAZZ_WORKER_ACCOUNT >> .env.local
            ```

            Your .env.local file should now contain `JAZZ_WEBHOOK_REGISTRY_SECRET` and `JAZZ_WEBHOOK_REGISTRY_ID`.

        - In a separate terminal, run the webhook registry:

            ```bash
            pnpx env-cmd -f .env.local -- pnpx jazz-run webhook run
            ```

    - **For production:**

        - click the "Enable webhooks" toggle in the worker settings in the dashboard and set the `JAZZ_WEBHOOK_REGISTRY_ID` env var in your production environment to the value now displayed in the worker credentials.

        - set the `JAZZ_WEBHOOK_ENDPOINT` env var in your production environment to the public URL of your app.

6. Install `workflow-world-jazz`

    ```bash
    pnpm add workflow-world-jazz
    ```

7. Run your app:

    ```bash
    pnpm dev
    ```

### Self-hosting everything

You can also use the open-source self-hostable version of Jazz. This requires running the sync server and a webhook registry on your own machine or infrastructure.

1. In a separate terminal or background process, run the Jazz sync server:

    ```bash
    pnpx jazz-run sync
    ```

    Locally your sync server will be available at `http://localhost:4200`. We will assume this as the sync server URL in the next steps. In production, you can run the sync server behind a reverse proxy - in this case, use the public URL of the sync server in the next steps instead.

2. Set the `JAZZ_SYNC_SERVER` environment variable to the URL of your sync server (`.env.local` file or production env vars).

    ```bash
    JAZZ_SYNC_SERVER=http://localhost:4200
    ```

3. Create a Jazz worker account:

    ```bash
    pnpx jazz-run account create --peer http://localhost:4200 --name "Workflow Worker" >> .env.local
    ```

    Your .env.local file should now contain `JAZZ_WORKER_ACCOUNT` and `JAZZ_WORKER_SECRET`.

4. Create a webhook registry and allow the worker created previously to register a webhook:

    ```bash
    pnpx env-cmd -f .env.local -x -- pnpx jazz-run webhook create-registry --peer http://localhost:4200 --grant \$JAZZ_WORKER_ACCOUNT >> .env.local
    ```

    Your .env.local file should now contain `JAZZ_WEBHOOK_REGISTRY_SECRET` and `JAZZ_WEBHOOK_REGISTRY_ID`.

5. In a separate terminal or background process, run the webhook registry:

    ```bash
    pnpx env-cmd -f .env.local -- pnpx jazz-run webhook run --peer http://localhost:4200
    ```

6. Install `workflow-world-jazz`

    ```bash
    pnpm add workflow-world-jazz
    ```

7. Run your app:

    ```bash
    pnpm dev
    ```

    **For deploying your app in production,** you need to run the sync server and webhook registry on long running servers and set environment variables according to your `.env.local` file.


## Deployment model

Jazz syncs data as CRDTs, so it has no transaction or conditional write that two
processes could race on and have exactly one win. The Workflow runtime needs
exactly that for its event log: every event gets the next position in its run's
log, and two writers must never take the same one. This World therefore
allocates positions inside its own process, serializing the writes to each run.

**Run one app process per Jazz worker account.** A single long-running server
(including `next start`, a container, or a VM) is supported. Several instances
sharing one worker account, such as autoscaled serverless functions, are not:
two of them can append to the same run concurrently. The World detects a log
written that way when it loads it and fails the run instead of replaying it out
of order.

A write is acknowledged once the sync server has it.

## Upgrading from 4.x

Workflow runs created by the 4.x World cannot be resumed by the 5.x runtime.
The v5 World keeps its data under a new key on the worker account and does not
read or modify what 4.x stored. Let in-flight runs finish on your 4.x
deployment before switching a deployment over, since the switch leaves them
unfinished.

Not supported by this World: hook token retention (`experimental_minRetention`),
hook takeover (`experimental_force`), dynamic workflows, and batched event
writes. The runtime detects each of these and either refuses the feature or
falls back to the unbatched path.

## Development

```bash
pnpm test        # unit tests, against an in-memory Jazz account
```

The `@workflow/world-testing` conformance suite needs a local sync server, a
worker account and a running webhook registry (see "Self-hosting everything"
above). With those running and their variables exported:

```bash
JAZZ_SYNC_SERVER=ws://127.0.0.1:4200 pnpm test:conformance
```

## Environment Variables Overview

| Variable                       | Description                                           | Default                                                                    |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `WORKFLOW_TARGET_WORLD`        | Set to `"workflow-world-jazz"` to use this world      | -                                                                          |
| `JAZZ_API_KEY`                 | Jazz API key   (if using Jazz Cloud)                                       | -                                                                          |
| `JAZZ_WORKER_ACCOUNT`          | Jazz account that will own all of the workflow data   | -                                                                          |
| `JAZZ_WORKER_SECRET`           | Secret for the worker account                         | -                                                                          |
| `JAZZ_WEBHOOK_REGISTRY_ID`     | CoValue ID for the webhook registry                   | -                                                                          |
| `JAZZ_WEBHOOK_REGISTRY_SECRET` | Secret for the webhook registry (only if self-hosting)                      | -                                                                          |
| `JAZZ_SYNC_SERVER`             | Sync server URL (only if self-hosting)                | Jazz Cloud (`wss://cloud.jazz.tools/?key=${JAZZ_API_KEY}`)                 |
| `JAZZ_WEBHOOK_ENDPOINT`        | The endpoint where webhooks should get delivered      | `http://localhost:${PORT}` or `http://localhost:3000` if `PORT` is not set |
