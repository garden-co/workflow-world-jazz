# AI SDK Workflow Patterns

This project shows common AI agent patterns using the Vercel Workflow SDK to make agents more durable and reliable. These patterns come from the [AI SDK Agent Patterns](https://ai-sdk.dev/docs/agents/workflows#patterns-with-examples) examples and are implemented using the Vercel Workflow SDK to provide fault tolerance, step-by-step execution, and better observability.

## Patterns Implemented

- **Sequential Workflow** - Multi-step AI processing with quality checks and conditional regeneration
- **Parallel Workflow** - Concurrent AI operations (e.g., parallel code reviews) with result aggregation  
- **Routing Workflow** - Dynamic routing to different AI models/prompts based on input classification
- **Orchestrator/Worker** - Coordinated AI agents where one orchestrates and others execute specialized tasks
- **Evaluator Loop** - Iterative AI improvement with evaluation and refinement cycles

This project uses the following stack:

- [Next.js](https://nextjs.org) 15 (App Router)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- Vercel Workflow SDK
- [Tailwind CSS](https://tailwindcss.com) & [shadcn/ui](https://ui.shadcn.com) - for styling
