import { runStep as __private_run_step } from "@vercel/workflow-core/runtime";
/**__internal_workflows{"steps":{"input.js":{"multiply":{"stepId":"step-input-js-multiply"}}}}*/;
export const multiply = async (a, b)=>__private_run_step("multiply", {
        arguments: [
            a,
            b
        ]
    });
