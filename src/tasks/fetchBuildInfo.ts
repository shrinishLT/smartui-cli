import { ListrTask, ListrRendererFactory } from 'listr2'
import { Context } from '../types.js'
import chalk from 'chalk'
import { updateLogContext } from '../lib/logger.js'

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Fetching build info`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'fetchBuildInfo'});

            try {
                task.title = 'Build info fetched';
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Build info fetching failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}