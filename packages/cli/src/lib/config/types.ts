export const validBuildTargets = [
  'vercel-static',
  'vercel-build-output-api',
  'next',
] as const;
export type BuildTarget = (typeof validBuildTargets)[number];

export type InspectCLIOptions = {
  json?: boolean;
  watch?: boolean;
  runId?: string;
  stepId?: string;
  cursor?: string;
};

export interface WorkflowConfig {
  watch?: boolean;
  dirs: string[];
  workingDir: string;
  runtimeImportPath?: string;
  buildTarget: BuildTarget;
  stepsBundlePath: string;
  workflowsBundlePath: string;

  // Optionally generate a client library for workflow execution. The preferred
  // method of using workflow is to use a loader within a framework (like
  // NextJS) that resolves client bindings on the fly.
  clientBundlePath?: string;

  externalPackages?: string[];

  workflowManifestPath?: string;
}

export function isValidBuildTarget(
  target: string | undefined
): target is BuildTarget {
  return target === 'vercel-static' || target === 'vercel-build-output-api';
}
