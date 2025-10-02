# @vercel/workflow-world

Core interfaces and types for Workflow SDK storage backends.

This package defines the `World` interface that abstracts workflow storage, queuing, authentication, and streaming operations. Implementation packages like `@vercel/workflow-world-embedded` and `@vercel/workflow-world-vercel` provide concrete implementations.

Used internally by `@vercel/workflow-core` and world implementations. Should not be used directly in application code.

