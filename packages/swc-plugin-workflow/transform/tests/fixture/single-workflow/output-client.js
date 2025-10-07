import { start as __private_workflow_start } from "@vercel/workflow-core/runtime";
/**__internal_workflows{"workflows":{"input.js":{"workflow":{"workflowId":"workflow-input-js-workflow"}}}}*/;
export async function workflow(a, b) {
    throw new Error("You attempted to execute workflow workflow function directly. To start a workflow, use start(workflow) from @vercel/workflow");
}
workflow.workflowId = "workflow-input-js-workflow";
