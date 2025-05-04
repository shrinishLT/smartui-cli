import { ListrTask, ListrRendererFactory } from 'listr2'
import { Context } from '../types.js'
import chalk from 'chalk'
import { updateLogContext } from '../lib/logger.js'

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Merging smartui branches`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'auth'});

            try {
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