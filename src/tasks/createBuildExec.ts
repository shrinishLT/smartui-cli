import { ListrTask, ListrRendererFactory } from 'listr2';
import { Context } from '../types.js'
import chalk from 'chalk';
import { updateLogContext } from '../lib/logger.js';
import { startPollingForTunnel } from '../lib/utils.js';
import { startTunnelBinary } from '../lib/utils.js';

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Creating SmartUI build`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'createBuild'});

            let errorCode = 0;
            try {
                if (ctx.config.tunnel) {
                    try {
                        await startTunnelBinary(ctx);
                    } catch (error: any) {
                        ctx.log.debug(`Error starting the tunnel: ${error.message}`);
                        errorCode = 1; 
                        throw new Error(`Error while starting tunnel binary`);
                    }
                }

                if (ctx.authenticatedInitially && !ctx.config.skipBuildCreation) {
                    let resp = await ctx.client.createBuild(ctx.git, ctx.config, ctx.log, ctx.build.name, ctx.isStartExec);
                    ctx.build = {
                        id: resp.data.buildId,
                        name: resp.data.buildName,
                        url: resp.data.buildURL,
                        baseline: resp.data.baseline,
                        useKafkaFlow: resp.data.useKafkaFlow || false,
                    }
                    if (ctx.build.id === '') {
                        ctx.log.debug('Build creation failed: Build ID is empty');
                        task.output = chalk.red('Build creation failed: Build ID is empty');
                        throw new Error('SmartUI build creation failed');
                    }
                    task.output = chalk.gray(`build id: ${resp.data.buildId}`);
                    task.title = 'SmartUI build created'
                } else {
                    task.output = chalk.gray(`Empty PROJECT_TOKEN and PROJECT_NAME. Skipping Creation of Build!`)
                    task.title = 'Skipped SmartUI build creation'
                }

                if (ctx.config.tunnel) {
                    if (ctx.build && ctx.build.id) {
                        startPollingForTunnel(ctx, '', false, '');
                    }
                }

                if (ctx.config.tunnel) {
                    let tunnelResp = await ctx.client.getTunnelDetails(ctx, ctx.log);
                    ctx.log.debug(`Tunnel Response: ${JSON.stringify(tunnelResp)}`)
                    if (tunnelResp && tunnelResp.data && tunnelResp.data.host && tunnelResp.data.port && tunnelResp.data.tunnel_name) {
                        ctx.tunnelDetails = {
                            tunnelHost: tunnelResp.data.host,
                            tunnelPort: tunnelResp.data.port,
                            tunnelName: tunnelResp.data.tunnel_name
                        }
                        ctx.log.debug(`Tunnel Details: ${JSON.stringify(ctx.tunnelDetails)}`)
                    } else if (tunnelResp && tunnelResp.error) {
                        if (tunnelResp.error.message) {
                            if (tunnelResp.error.code && tunnelResp.error.code === 400) {
                                ctx.log.warn(tunnelResp.error.message)
                            } else {
                                ctx.log.warn(`Error while fetch tunnel details; Either tunnel is not running or tunnel parameters are different`)
                            }
                        }
                    }
                }
            } catch (error: any) {
                ctx.log.debug(error);
                if (errorCode === 1) {
                    task.output = chalk.gray(error.message);
                    throw new Error('Skipped SmartUI build creation');
                } else {
                    task.output = chalk.gray(error.message);
                    throw new Error('SmartUI build creation failed');
                }
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}