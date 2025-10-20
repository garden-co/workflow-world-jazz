# @vercel/workflow-world-jazz

Jazz-based workflow backend.

This package is meant to be for internal testing.
For production use, use the official [Jazz World](https://github.com/garden-co/v-workflow/tree/jazz-world) implementation.

## Setup

**Execute these commands in the directory of an app using the Jazz world**

1. Add this package to your project's dependencies:

    ```diff
    @@ -1,6 +1,7 @@
     {
       "dependencies": {
    +     "@vercel/workflow-world-jazz": "workspace:*"
       }
     }
    ```

2. Add your Jazz API key to the .env.local file:

    ```bash
    export JAZZ_API_KEY=<your-api-key>
    echo "JAZZ_API_KEY=$JAZZ_API_KEY" >> .env.local
    ```

3. Create a worker account (will be used to submit items to the queue):

    ```bash
    pnpm dlx jazz-run account create --name "Queue Pusher" >> .env.local
    ```

4. Create a webhook registry:

    ```bash
    pnpm dlx https://pkg.pr.new/garden-co/jazz/jazz-run@4c061d8c81fb6fd1413d4be970c76c3d1d1495c6 webhook create-registry >> .env.local
    ```

    Your .env.local file should now have credentials for both the worker and the registry account, as well as a registry ID.

5. Allow the worker created in step 1 to register a webhook:

    ```bash
    set -a && source .env.local
    pnpm dlx https://pkg.pr.new/garden-co/jazz/jazz-run@4c061d8c81fb6fd1413d4be970c76c3d1d1495c6 webhook grant --accountID $JAZZ_WORKER_ACCOUNT
    ```

6. Run the webhook registry:

    ```bash
    pnpm dlx https://pkg.pr.new/garden-co/jazz/jazz-run@4c061d8c81fb6fd1413d4be970c76c3d1d1495c6 webhook run
    ```

7. Run your app:

    ```bash
    export WORKFLOW_TARGET_WORLD=@vercel/workflow-world-jazz
    pnpm dev
    ```
