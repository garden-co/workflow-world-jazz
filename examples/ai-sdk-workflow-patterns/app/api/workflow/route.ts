import { NextResponse } from 'next/server';
import { evaluatorWorkflow } from '@/workflows/evaluator-workflow';
import { orchestratorWorkflow } from '@/workflows/orchestrator-workflow';
import { parallelWorkflow } from '@/workflows/parallel-workflow';
import { routingWorkflow } from '@/workflows/routing-workflow';
import { sequentialWorkflow } from '@/workflows/sequential-workflow';

export async function POST(request: Request) {
  const { pattern } = await request.json();

  switch (pattern) {
    case 'sequential':
      // Marketing Copy
      await sequentialWorkflow(
        'Vercel Workflow SDK for building durable workflows that survive restarts'
      );
      break;
    case 'parallel':
      // Security Review
      await parallelWorkflow(
        `import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const cacheKey = 'user-' + params.id;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const response = await fetch('https://api.example.com/users/' + params.id);

  if (!response.ok) {
    return NextResponse.json({ error: 'Upstream failure' }, { status: 502 });
  }

  const data = await response.json();
  await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);

  return NextResponse.json(data);
}
`
      );
      break;
    case 'routing':
      await routingWorkflow(
        'My Vercel deployment has been stuck in the "Building" state for over 20 minutes. Logs show repeated retries pulling npm packages. Can you help me resolve it?'
      );
      break;
    case 'evaluator':
      await evaluatorWorkflow(
        'Workflow SDK is a TypeScript framework for building durable, reliable, and observable applications that keep running through failures and random restarts.',
        'es'
      );
      break;
    case 'orchestrator':
      await orchestratorWorkflow(
        'Add a dark mode toggle to the Next.js dashboard, persist the preference per user, and ensure the UI updates without a full reload.'
      );
      break;
  }

  return NextResponse.json({});
}
