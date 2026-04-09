# workflow-world-jazz

A Jazz-based World implementation for the [Workflow Development Kit](https://useworkflow.dev).

You can follow these steps to try out Jazz as the backend for the [examples in the Workflow Development Kit](https://github.com/vercel/workflow/tree/main/examples) or when building your own apps using Workflows.

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

Package Sidebar
Install

npm i workflow-world-jazz
Weekly Downloads

3
Version

4.0.1-beta.1
License

none
Last publish

6 months ago
Collaborators

    anselm_io

Analyze security with SocketCheck bundle sizeView package healthExplore dependencies
Report malware
