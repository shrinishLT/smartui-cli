import { ListrTask, ListrRendererFactory } from 'listr2'
import { Context } from '../types.js'
import chalk from 'chalk'
import { updateLogContext } from '../lib/logger.js'

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Fetching branch info`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'fetchBranchInfo'});

            try {
                if (ctx.mergeBranchSource === ctx.mergeBranchTarget) {
                    ctx.log.error(`Merging two similar branch is not possible`)
                    throw new Error(`Merging two similar branch is not possible`);
                }

                const requestData = {
                    source: ctx.mergeBranchSource,
                    target: ctx.mergeBranchTarget,
                    byBranch: ctx.mergeByBranch,
                    byBuild: ctx.mergeByBuild,
                };
                
                let resp = await ctx.client.fetchBuildInfo(requestData, ctx);
                if (resp && resp.data && resp.data.source && resp.data.target) {
                    ctx.mergeBuildSourceId = resp.data.source
                    ctx.mergeBuildTargetId = resp.data.target
                    ctx.log.debug(`Merge Build source buildId: ${ctx.mergeBuildSourceId} and target buildId: ${ctx.mergeBuildTargetId}`)
                } else if (resp && resp.error) {
                    if (resp.error.message) {
                        ctx.log.error(`Error while fetching branch Info: ${resp.error.message}`)
                        throw new Error(`Error while fetching branch Info: ${resp.error.message}`);
                    }
                }
                task.title = 'Branch info fetched';
                task.output = chalk.gray(`Source buildId: ${ctx.mergeBuildSourceId} and Target buildId: ${ctx.mergeBuildTargetId}`);
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Branch info fetching failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}