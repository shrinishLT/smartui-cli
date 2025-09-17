import { Command } from 'commander';
import { Context } from '../types.js';
import { color, Listr, ListrDefaultRendererLogLevels } from 'listr2';
import startServer from '../tasks/startServer.js';
import authExec from '../tasks/authExec.js';
import ctxInit from '../lib/ctx.js';
import getGitInfo from '../tasks/getGitInfo.js';
import createBuildExec from '../tasks/createBuildExec.js';
import snapshotQueue from '../lib/snapshotQueue.js';
import { startPolling, startPingPolling } from '../lib/utils.js';
import startTunnel from '../tasks/startTunnel.js'
const util = require('util');

const command = new Command();

command
    .name('exec:start')
    .description('Start SmartUI server')
    .option('-P, --port <number>', 'Port number for the server')
    .option('--fetch-results [filename]', 'Fetch results and optionally specify an output file, e.g., <filename>.json')
    .option('--buildName <string>', 'Specify the build name')
    .action(async function(this: Command) {
        const options = command.optsWithGlobals();
        if (options.buildName === '') {
            console.log(`Error: The '--buildName' option cannot be an empty string.`);
            process.exit(1);
        }
        let ctx: Context = ctxInit(command.optsWithGlobals());
        ctx.snapshotQueue = new snapshotQueue(ctx);
        ctx.totalSnapshots = 0
        ctx.isStartExec = true
        ctx.sourceCommand = 'exec-start'
        
        let tasks = new Listr<Context>(
            [
                authExec(ctx),
                startServer(ctx),
                getGitInfo(ctx),
                ...(ctx.config.tunnel && ctx.config.tunnel?.type === 'auto' ? [startTunnel(ctx)] : []),
                createBuildExec(ctx),

            ],
            {
                rendererOptions: {
                    icon: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: `→`
                    },
                    color: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: color.gray
                    }
                }
            }
        );

        try {
            await tasks.run(ctx);
            if (ctx.build && ctx.build.id) {
                startPingPolling(ctx);
            }
            if (ctx.options.fetchResults && ctx.build && ctx.build.id) {
                startPolling(ctx, '', false, '')
            }

            // await ctx.client.getScreenshotData("567890", false, ctx.log, "755#a5ac6a67-289a-427d-b004-7dfff6c3484b#fanniemae-stage", 'smartui-bbf5b47005');

    
        } catch (error) {
            // Log the error in a human-readable format
            // ctx.log.debug(util.inspect(error, { showHidden: false, depth: null }));
                
            // console.log(`Json Error: ${JSON.stringify(error, null, 2)}`);
            // if (error?.message.includes('ENOTFOUND')) {
            //     ctx.log.error('Error: Network error occurred while fetching build status while polling. Please check your connection and try again.');
            // } else {
            //     // Log the error in a human-readable format
            //     ctx.log.debug(util.inspect(error, { showHidden: false, depth: null }));
            //     ctx.log.error(`Error fetching build status while polling: ${JSON.stringify(error)}`);
            // }
            console.error('Error during server execution:', error);
            process.exit(1);
        }
    });

export default command;
