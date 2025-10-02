import builtinModules from 'builtin-modules';
import type * as esbuild from 'esbuild';

const nodeModulesRegex = new RegExp(`^(${builtinModules.join('|')})`);

export function createNodeModuleErrorPlugin(): esbuild.Plugin {
  return {
    name: 'workflow-node-module-error',
    setup(build) {
      build.onResolve({ filter: nodeModulesRegex }, (args) => {
        // Ignore if the import is coming from a node_modules folder
        if (args.importer.includes('node_modules')) return null;

        return {
          path: args.path,
          errors: [
            {
              text: `Cannot use Node.js module "${args.path}" in workflow functions. Move this module to a step function.`,
            },
          ],
        };
      });
    },
  };
}
