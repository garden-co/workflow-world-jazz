# @vercel/workflow-world-jazz

Jazz-based workflow backend.

## Setup

**Execute these commands in the directory of an app using the Jazz world**

1. Create a worker account (will be used to submit items to the queue):

    ```bash
    pnpm exec jazz-run account create --name "Queue Pusher" >> .env.local
    ```

2. Create a webhook registry:

    ```bash
    pnpm exec jazz-run webhook create-registry >> .env.local
    ```

    Your .env.local file should now have credentials for both the worker and the registry account, as well as a registry ID.

3. Allow the worker created in step 1 to register a webhook:

    ```bash
    set -a && source .env.local && pnpm exec jazz-run webhook grant --accountID $JAZZ_WORKER_ACCOUNT
    ```

4. Run the webhook registry:

    ```bash
    pnpm exec jazz-run webhook run
    ```

5. Run the app:

    ```bash
    pnpm dev
    ```