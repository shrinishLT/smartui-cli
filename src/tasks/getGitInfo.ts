import { ListrTask, ListrRendererFactory } from 'listr2';
import { Context } from '../types.js'
import getGitInfo, { isGitRepo } from '../lib/git.js'
import chalk from 'chalk';

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Fetching git repo details`,
        skip: (ctx): string => {
            return (!isGitRepo() && !ctx.env.SMARTUI_GIT_INFO_FILEPATH) ? '[SKIPPED] Fetching git repo details; not a git repo' : '';
        },
        task: async (ctx, task): Promise<void> => {
            if (ctx.env.CURRENT_BRANCH && ctx.env.CURRENT_BRANCH.trim() === '') {
                throw new Error('Error: The environment variable CURRENT_BRANCH cannot be empty.');
            }
            try {
                ctx.git = getGitInfo(ctx);
                task.output = chalk.gray(`branch: ${ctx.git.branch}, commit: ${ctx.git.commitId}, author: ${ctx.git.commitAuthor}`);
                if (ctx.git.githubURL && ctx.git.githubURL !== '') {
                    task.output += chalk.gray(`, githubURL: ${ctx.git.githubURL}`);
                }
                task.title = 'Fetched git information'
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(`${error.message}`)
                throw new Error('Error fetching git repo details')
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}
