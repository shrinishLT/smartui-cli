import { Command } from 'commander';
import { Context } from '../types.js';
import { color, Listr, ListrDefaultRendererLogLevels } from 'listr2';
import startServer from '../tasks/startServer.js';
import auth from '../tasks/auth.js';
import ctxInit from '../lib/ctx.js';
import getGitInfo from '../tasks/getGitInfo.js';
import createBuild from '../tasks/createBuild.js';
import snapshotQueue from '../lib/snapshotQueue.js';
import { startPolling, startPingPolling } from '../lib/utils.js';
import fetchBuildInfo from '../tasks/fetchBuildInfo.js'
import mergeBuilds from '../tasks/mergeBuilds.js'

const command = new Command();

command
    .name('merge')
    .description('Merge a source branch into the target branch')
    .command('branch')
    .description('Merge the source branch into the target branch')
    .requiredOption('--source <string>', 'Source branch to merge')
    .requiredOption('--target <string>', 'Target branch to merge into')
    .action(async function(this: Command, options: { source: string, target: string }) {
        const { source, target } = options;
        let ctx: Context = ctxInit(command.optsWithGlobals());

        if (!source || source.trim() === '') {
            ctx.log.error('Error: The --source option cannot be empty.');
            process.exit(1);
        }
        if (!target || target.trim() === '') {
            ctx.log.error('Error: The --target option cannot be empty.');
            process.exit(1);
        }

        ctx.log.debug(`Merging source branch '${source}' into target branch '${target}'`);
        ctx.snapshotQueue = new snapshotQueue(ctx);
        ctx.totalSnapshots = 0;
        ctx.isStartExec = true;

        let tasks = new Listr<Context>(
            [
                auth(ctx),
                fetchBuildInfo(ctx),
                mergeBuilds(ctx),
            ],
            {
                rendererOptions: {
                    icon: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: '→'
                    },
                    color: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: color.gray
                    }
                }
            }
        );

        try {
            await tasks.run(ctx);
        } catch (error) {
            console.error('Error during merge operation:', error);
        }
    });

export default command;
