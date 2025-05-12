import { ListrTask, ListrRendererFactory } from 'listr2'
import { Context } from '../types.js'
import chalk from 'chalk'
import { updateLogContext } from '../lib/logger.js'
import { error } from 'console'

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Fetching build info`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'fetchBuildInfo'});

            try {
                if (ctx.mergeBuildSource === ctx.mergeBuildTarget) {
                    ctx.log.error(`Merging two similar build is not possible`)
                    throw new Error(`Merging two similar build is not possible`);
                }

                const requestData = {
                    source: ctx.mergeBuildSource,
                    target: ctx.mergeBuildTarget,
                    byBranch: ctx.mergeByBranch,
                    byBuildName: ctx.mergeByBuild,
                };

                let resp = await ctx.client.fetchBuildInfo(requestData, ctx);
                if (resp && resp.data && resp.data.source && resp.data.target) {
                    ctx.mergeBuildSourceId = resp.data.source
                    ctx.mergeBuildTargetId = resp.data.target
                    ctx.log.debug(`Merge Build source buildId: ${ctx.mergeBuildSourceId} and target buildId: ${ctx.mergeBuildTargetId}`)
                } else if (resp && resp.error) {
                    if (resp.error.message) {
                        ctx.log.error(`Error while fetching buildInfo: ${resp.error.message}`)
                        throw new Error(`Error while fetching buildInfo: ${resp.error.message}`);
                    }
                }
                task.title = 'Build info fetched';
                task.output = chalk.gray(`Source buildId: ${ctx.mergeBuildSourceId} and Target buildId: ${ctx.mergeBuildTargetId}`);
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Build info fetching failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}