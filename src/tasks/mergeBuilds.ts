import { ListrTask, ListrRendererFactory } from 'listr2'
import { Context } from '../types.js'
import chalk from 'chalk'
import { updateLogContext } from '../lib/logger.js'

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Merging smartui builds`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'mergeBuilds'});

            try {
                let resp
                if (ctx.mergeByBranch) {
                    resp = await ctx.client.mergeBuildsByBuildId(ctx.mergeBuildSourceId, ctx.mergeBuildTargetId, ctx.mergeByBranch, ctx.mergeByBuild, ctx.mergeBranchSource, ctx.mergeBranchTarget, '', '', ctx);
                } else {
                    resp = await ctx.client.mergeBuildsByBuildId(ctx.mergeBuildSourceId, ctx.mergeBuildTargetId, ctx.mergeByBranch, ctx.mergeByBuild, '', '', ctx.mergeBuildSource, ctx.mergeBuildTarget, ctx);
                }
                
                task.title = 'Merging smartui branch initiated';
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Merging smartui branch failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}