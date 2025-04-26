import { Context } from '../types.js'
import { chromium, firefox, webkit, Browser } from '@playwright/test'
import constants from './constants.js';
import chalk from 'chalk';
import axios from 'axios';
import fs from 'fs';
import { globalAgent } from 'http';
import { promisify } from 'util'
import { build } from 'tsup';

var lambdaTunnel = require('@lambdatest/node-tunnel');
const sleep = promisify(setTimeout);

// let isPollingActive = false;
let globalContext: Context;

let tunnelInstance;
export const setGlobalContext = (newContext: Context): void => {
    globalContext = newContext;
};

export function delDir(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
    }
}

export function scrollToBottomAndBackToTop({
    frequency = 100,
    timing = 8,
    remoteWindow = window
} = {}): Promise<void> {
    return new Promise(resolve => {
        let scrolls = 1;
        let scrollLength = remoteWindow.document.body.scrollHeight / frequency;

        (function scroll() {
            let scrollBy = scrollLength * scrolls;

            remoteWindow.setTimeout(() => {
                remoteWindow.scrollTo(0, scrollBy);

                if (scrolls < frequency) {
                    scrolls += 1;
                    scroll();
                }

                if (scrolls === frequency) {
                    remoteWindow.setTimeout(() => {
                        remoteWindow.scrollTo(0, 0)
                        resolve();
                    }, timing);
                }
            }, timing);
        })();
    });
}

export async function launchBrowsers(ctx: Context): Promise<Record<string, Browser>> {
    let browsers: Record<string, Browser> = {};
    const isHeadless = process.env.HEADLESS?.toLowerCase() === 'false' ? false : true;
    let launchOptions: Record<string, any> = { headless: isHeadless };

    if (ctx.config.web) {
        for (const browser of ctx.config.web.browsers) {
            switch (browser) {
                case constants.CHROME:
                    browsers[constants.CHROME] = await chromium.launch(launchOptions);
                    break;
                case constants.SAFARI:
                    browsers[constants.SAFARI] = await webkit.launch(launchOptions);
                    break;
                case constants.FIREFOX:
                    browsers[constants.FIREFOX] = await firefox.launch(launchOptions);
                    break;
                case constants.EDGE:
                    launchOptions.args = ['--headless=new'];
                    browsers[constants.EDGE] = await chromium.launch({ channel: constants.EDGE_CHANNEL, ...launchOptions });
                    break;
            }
        }
    }
    if (ctx.config.mobile) {
        for (const device of ctx.config.mobile.devices) {
            if (constants.SUPPORTED_MOBILE_DEVICES[device].os === 'android' && !browsers[constants.CHROME]) browsers[constants.CHROME] = await chromium.launch(launchOptions);
            else if (constants.SUPPORTED_MOBILE_DEVICES[device].os === 'ios' && !browsers[constants.SAFARI]) browsers[constants.SAFARI] = await webkit.launch(launchOptions);
        }
    }

    return browsers;
}

export async function closeBrowsers(browsers: Record<string, Browser>): Promise<void> {
    for (const browserName of Object.keys(browsers)) await browsers[browserName]?.close();
}

export function getWebRenderViewports(ctx: Context): Array<Record<string, any>> {
    let webRenderViewports: Array<Record<string, any>> = [];

    if (ctx.config.web) {
        for (const viewport of ctx.config.web.viewports) {
            webRenderViewports.push({
                viewport,
                viewportString: `${viewport.width}${viewport.height ? 'x' + viewport.height : ''}`,
                fullPage: viewport.height ? false : true,
                device: false
            })
        }
    }

    return webRenderViewports
}

export function getWebRenderViewportsForOptions(options: any): Array<Record<string, any>> {
    let webRenderViewports: Array<Record<string, any>> = [];

    if (options.web && Array.isArray(options.web.viewports)) {
        for (const viewport of options.web.viewports) {
            if (Array.isArray(viewport) && viewport.length > 0) {
                let viewportObj: { width: number; height?: number } = {
                    width: viewport[0]
                };

                if (viewport.length > 1) {
                    viewportObj.height = viewport[1];
                }

                webRenderViewports.push({
                    viewport: viewportObj,
                    viewportString: `${viewport[0]}${viewport[1] ? 'x' + viewport[1] : ''}`,
                    fullPage: viewport.length === 1,
                    device: false
                });
            }
        }
    }

    return webRenderViewports;
}

export function getMobileRenderViewports(ctx: Context): Record<string, any> {
    let mobileRenderViewports: Record<string, Array<Record<string, any>>> = {}
    mobileRenderViewports[constants.MOBILE_OS_IOS] = [];
    mobileRenderViewports[constants.MOBILE_OS_ANDROID] = [];

    if (ctx.config.mobile) {
        for (const device of ctx.config.mobile.devices) {
            let os = constants.SUPPORTED_MOBILE_DEVICES[device].os;
            let { width, height } = constants.SUPPORTED_MOBILE_DEVICES[device].viewport;
            let portrait = (ctx.config.mobile.orientation === constants.MOBILE_ORIENTATION_PORTRAIT) ? true : false;

            mobileRenderViewports[os]?.push({
                viewport: { width: portrait ? width : height, height: portrait ? height : width },
                viewportString: `${device} (${ctx.config.mobile.orientation})`,
                fullPage: ctx.config.mobile.fullPage,
                device: true,
                os: os
            })
        }
    }

    return mobileRenderViewports
}

export function getMobileRenderViewportsForOptions(options: any): Record<string, any> {
    let mobileRenderViewports: Record<string, Array<Record<string, any>>> = {}
    mobileRenderViewports[constants.MOBILE_OS_IOS] = [];
    mobileRenderViewports[constants.MOBILE_OS_ANDROID] = [];

    if (options.mobile) {
        for (const device of options.mobile.devices) {
            let os = constants.SUPPORTED_MOBILE_DEVICES[device].os;
            let { width, height } = constants.SUPPORTED_MOBILE_DEVICES[device].viewport;
            let orientation = options.mobile.orientation || constants.MOBILE_ORIENTATION_PORTRAIT;
            let portrait = (orientation === constants.MOBILE_ORIENTATION_PORTRAIT);

            // Check if fullPage is specified, otherwise use default
            let fullPage
            if (options.mobile.fullPage === undefined || options.mobile.fullPage) {
                fullPage = true
            } else {
                fullPage = false
            }

            mobileRenderViewports[os]?.push({
                viewport: { width: portrait ? width : height, height: portrait ? height : width },
                viewportString: `${device} (${orientation})`,
                fullPage: fullPage,
                device: true,
                os: os
            })
        }
    }

    return mobileRenderViewports
}

export function getRenderViewports(ctx: Context): Array<Record<string, any>> {
    let mobileRenderViewports = getMobileRenderViewports(ctx);
    let webRenderViewports = getWebRenderViewports(ctx);

    // Combine arrays ensuring web viewports are first
    return [
        ...webRenderViewports,
        ...mobileRenderViewports[constants.MOBILE_OS_IOS],
        ...mobileRenderViewports[constants.MOBILE_OS_ANDROID]
    ];
}

export function getRenderViewportsForOptions(options: any): Array<Record<string, any>> {
    let mobileRenderViewports = getMobileRenderViewportsForOptions(options);
    let webRenderViewports = getWebRenderViewportsForOptions(options);

    // Combine arrays ensuring web viewports are first
    return [
        ...webRenderViewports,
        ...mobileRenderViewports[constants.MOBILE_OS_IOS],
        ...mobileRenderViewports[constants.MOBILE_OS_ANDROID]
    ];
}

// Global SIGINT handler
// process.on('SIGINT', async () => {
//     if (isPollingActive) {
//         console.log('Fetching results interrupted. Exiting...');
//         isPollingActive = false;
//     } else {
//         console.log('\nExiting gracefully...');
//     }
//     process.exit(0);
// });

// Background polling function
export async function startPolling(ctx: Context, build_id: string, baseline: boolean, projectToken: string): Promise<void> {
    let isPollingActive = true;
    if (build_id) {
        ctx.log.info(`Fetching results for buildId ${build_id} in progress....`);
    } else if (ctx.build && ctx.build.id) {
        ctx.log.info(`Fetching results for buildId ${ctx.build.id} in progress....`);
    }

    const intervalId = setInterval(async () => {
        if (!isPollingActive) {
            clearInterval(intervalId);
            return;
        }

        try {
            let resp;
            if (build_id) {
                resp = await ctx.client.getScreenshotData(build_id, baseline, ctx.log, projectToken);
            } else if (ctx.build && ctx.build.id) {
                resp = await ctx.client.getScreenshotData(ctx.build.id, ctx.build.baseline, ctx.log, '');
            } else {
                return;
            }

            if (!resp.build) {
                ctx.log.info("Error: Build data is null.");
                clearInterval(intervalId);
                return;
            }

            let fileName = `${resp.build.build_id}.json`
            if (ctx.options.fetchResults && ctx.options.fetchResultsFileName && ctx.build && ctx.build.id && resp.build.build_id === ctx.build.id) {
                fileName = `${ctx.options.fetchResultsFileName}`
            }
            fs.writeFileSync(`${fileName}`, JSON.stringify(resp, null, 2));
            ctx.log.debug(`Updated results in ${fileName}`);

            if (resp.build.build_status_ind === constants.BUILD_COMPLETE || resp.build.build_status_ind === constants.BUILD_ERROR) {
                clearInterval(intervalId);
                ctx.log.info(`Fetching results completed. Final results written to ${fileName}`);


                // Evaluating Summary
                let totalScreenshotsWithMismatches = 0;
                let totalVariantsWithMismatches = 0;
                const totalScreenshots = Object.keys(resp.screenshots || {}).length;
                let totalVariants = 0;

                for (const [screenshot, variants] of Object.entries(resp.screenshots || {})) {
                    let screenshotHasMismatch = false;
                    let variantMismatchCount = 0;

                    totalVariants += variants.length; // Add to total variants count

                    for (const variant of variants) {
                        if (variant.mismatch_percentage > 0) {
                            screenshotHasMismatch = true;
                            variantMismatchCount++;
                        }
                    }

                    if (screenshotHasMismatch) {
                        totalScreenshotsWithMismatches++;
                        totalVariantsWithMismatches += variantMismatchCount;
                    }
                }

                // Display summary
                ctx.log.info(
                    chalk.green.bold(
                        `\nSummary of Mismatches for buildId: ${build_id}\n` +
                        `${chalk.yellow('Total Variants with Mismatches:')} ${chalk.white(totalVariantsWithMismatches)} out of ${chalk.white(totalVariants)}\n` +
                        `${chalk.yellow('Total Screenshots with Mismatches:')} ${chalk.white(totalScreenshotsWithMismatches)} out of ${chalk.white(totalScreenshots)}\n` +
                        `${chalk.yellow('Branch Name:')} ${chalk.white(resp.build.branch)}\n` +
                        `${chalk.yellow('Project Name:')} ${chalk.white(resp.project.name)}\n` +
                        `${chalk.yellow('Build ID:')} ${chalk.white(resp.build.build_id)}\n`
                    )
                );
            }
        } catch (error: any) {
            if (error.message.includes('ENOTFOUND')) {
                ctx.log.error('Error: Network error occurred while fetching build results. Please check your connection and try again.');
                clearInterval(intervalId);
            } else {
                ctx.log.error(`Error fetching screenshot data: ${error.message}`);
            }
            clearInterval(intervalId);
        }
    }, 5000);
}

export let pingIntervalId: NodeJS.Timeout | null = null;

export async function startPingPolling(ctx: Context): Promise<void> {
    try {
        ctx.log.debug('Sending initial ping to server...');
        await ctx.client.ping(ctx.build.id, ctx.log);
        ctx.log.debug('Initial ping sent successfully.');
    } catch (error: any) {
        ctx.log.error(`Error during initial ping: ${error.message}`);
    }

    // Start the polling interval
    pingIntervalId = setInterval(async () => {
        try {
            ctx.log.debug('Sending ping to server...');
            await ctx.client.ping(ctx.build.id, ctx.log);
            ctx.log.debug('Ping sent successfully.');
        } catch (error: any) {
            ctx.log.error(`Error during ping polling: ${error.message}`);
        }
    }, 10 * 60 * 1000); // 10 minutes interval
}

export async function startTunnelBinary(ctx: Context) {
    let tunnelConfig = ctx.config.tunnel
    let tunnelArguments = {
        user: tunnelConfig.user || ctx.env.LT_USERNAME || '',
        key: tunnelConfig.key || ctx.env.LT_ACCESS_KEY || ''
    };

    ctx.config.tunnel.user = tunnelConfig?.user || ctx.env.LT_USERNAME || ''
    ctx.config.tunnel.key = tunnelConfig?.key || ctx.env.LT_ACCESS_KEY || ''

    if (tunnelConfig.port) {
        tunnelArguments.port = tunnelConfig.port;
    }
    if (tunnelConfig?.proxyHost) {
        tunnelArguments.proxyHost = tunnelConfig.proxyHost
    }
    if (tunnelConfig?.proxyPort) {
        tunnelArguments.proxyPort = tunnelConfig.proxyPort
    }
    if (tunnelConfig?.proxyUser) {
        tunnelArguments.proxyUser = tunnelConfig.proxyUser
    }
    if (tunnelConfig?.proxyPass) {
        tunnelArguments.proxyPass = tunnelConfig.proxyPass
    }
    if (tunnelConfig?.dir) {
        tunnelArguments.dir = tunnelConfig.dir
    }
    if (tunnelConfig?.v) {
        tunnelArguments.v = tunnelConfig.v
        tunnelArguments.logLevel = 'debug'
    }
    if (tunnelConfig?.logFile) {
        tunnelArguments.logFile = tunnelConfig.logFile
    }

    if (tunnelConfig?.tunnelName) {
        tunnelArguments.tunnelName = tunnelConfig.tunnelName
    } else {
        const randomNumber = Math.floor(100000 + Math.random() * 900000);
        let randomTunnelName = `smartui-cli-Node-tunnel-${randomNumber}`
        tunnelArguments.tunnelName = randomTunnelName;
        ctx.config.tunnel.tunnelName = randomTunnelName
    }
    
    ctx.log.debug(`tunnel config ${JSON.stringify(tunnelArguments)}`)

    if (ctx.config.tunnel?.type === 'auto') {
        tunnelInstance = new lambdaTunnel();
        const istunnelStarted = await tunnelInstance.start(tunnelArguments);
        ctx.log.debug('Tunnel is started Successfully with status ' + istunnelStarted);
        const tunnelRunningStatus = await tunnelInstance.isRunning();
        ctx.log.debug('Running status of tunnel after start ? ' + tunnelRunningStatus);
    }
}

export async function startPollingForTunnel(ctx: Context, build_id: string, baseline: boolean, projectToken: string): Promise<void> {
    const intervalId = setInterval(async () => {
        try {
            let resp;
            if (build_id) {
                resp = await ctx.client.getScreenshotData(build_id, baseline, ctx.log, projectToken);
            } else if (ctx.build && ctx.build.id) {
                resp = await ctx.client.getScreenshotData(ctx.build.id, ctx.build.baseline, ctx.log, '');
            } else {
                return;
            }

            if (!resp.build) {
                ctx.log.info("Error: Build data is null.");
                clearInterval(intervalId);

                const tunnelRunningStatus = await tunnelInstance.isRunning();
                ctx.log.debug('Running status of tunnel before stopping ? ' + tunnelRunningStatus);

                const status = await tunnelInstance.stop();
                ctx.log.debug('Tunnel is Stopped ? ' + status);
                
                return;
            }

            if (resp.build.build_status_ind === constants.BUILD_COMPLETE || resp.build.build_status_ind === constants.BUILD_ERROR) {
                clearInterval(intervalId);

                const tunnelRunningStatus = await tunnelInstance.isRunning();
                ctx.log.debug('Running status of tunnel before stopping ? ' + tunnelRunningStatus);

                const status = await tunnelInstance.stop();
                ctx.log.debug('Tunnel is Stopped ? ' + status);

            }
        } catch (error: any) {
            if (error.message.includes('ENOTFOUND')) {
                ctx.log.error('Error: Network error occurred while fetching build status while polling. Please check your connection and try again.');
                clearInterval(intervalId);
            } else {
                ctx.log.error(`Error fetching build status while polling: ${error.message}`);
            }
            clearInterval(intervalId);
        }
    }, 5000);
}

export async function stopTunnelHelper(ctx: Context) {
    const tunnelRunningStatus = await tunnelInstance.isRunning();
    ctx.log.debug('Running status of tunnel before stopping ? ' + tunnelRunningStatus);

    if (tunnelRunningStatus) {
        const status = await tunnelInstance.stop();
        ctx.log.debug('Tunnel is Stopped ? ' + status);
    }
} 



