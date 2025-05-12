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
                    ctx.git.branch = ctx.mergeBranchTarget
                    const requestData = {
                        source: ctx.mergeBuildSourceId,
                        target: ctx.mergeBuildTargetId,
                        byBranch: ctx.mergeByBranch,
                        byBuildName: ctx.mergeByBuild,
                        sourceBranchName: ctx.mergeBranchSource,
                        targetBranchName: ctx.mergeBranchTarget,
                        sourceBuildName: '',
                        targetBuildName: '',
                        git: ctx.git
                    };
                    resp = await ctx.client.mergeBuildsByBuildId(requestData, ctx);
                } else {
                    const requestData = {
                        source: ctx.mergeBuildSourceId,
                        target: ctx.mergeBuildTargetId,
                        byBranch: ctx.mergeByBranch,
                        byBuildName: ctx.mergeByBuild,
                        sourceBranchName: '',
                        targetBranchName: '',
                        sourceBuildName: ctx.mergeBuildSource,
                        targetBuildName: ctx.mergeBuildTarget,
                        git: ctx.git
                    };
                    resp = await ctx.client.mergeBuildsByBuildId(requestData, ctx);
                }
                if (resp && resp.data && resp.data.message) {
                    ctx.log.debug(`${resp.data.message}`)
                } else {
                    ctx.log.error(`Error while initiating merging process: ${resp.error.message}`)
                    throw new Error(`Error while initiating merging process: ${resp.error.message}`);
                }
                task.title = 'Merging SmartUI builds initiated';
                task.output = chalk.gray(`${resp.data.message}`);
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Merging SmartUI build failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}