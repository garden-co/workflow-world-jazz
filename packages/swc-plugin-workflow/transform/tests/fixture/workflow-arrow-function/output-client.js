import { start as __private_workflow_start } from "@vercel/workflow-core/runtime";
/**__internal_workflows{"workflows":{"input.js":{"processData":{"workflowId":"workflow-input-js-processData"}}}}*/;
export const processData = async (data)=>{
    throw new Error("You attempted to execute workflow processData function directly. To start a workflow, use start(processData) from @vercel/workflow");
};
processData.workflowId = "workflow-input-js-processData";
