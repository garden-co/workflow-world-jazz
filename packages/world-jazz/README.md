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
  
1. Get a Jazz API key. You can register a free account at <https://dashboard.jazz.tools/>.

1. Setup the Jazz queue:

    ```bash
    JAZZ_API_KEY=<your-api-key> ./queue/setup.sh > .env.local
    ```

1. Run the Jazz queue:

    ```bash
    docker compose --env-file=.env.local up -d
    ```

1. Run your app:

    ```bash
    export WORKFLOW_TARGET_WORLD=@vercel/workflow-world-jazz
    pnpm dev
    ```
