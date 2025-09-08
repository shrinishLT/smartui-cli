import {Command} from "commander";
import { Context } from '../types.js';
import ctxInit from '../lib/ctx.js';
import { color, Listr, ListrDefaultRendererLogLevels, LoggerFormat } from 'listr2';
import fs from 'fs';
import auth from '../tasks/auth.js';
import uploadPdfs from '../tasks/uploadPdfs.js';
import {startPdfPolling} from "../lib/utils.js";
const command = new Command();

command
    .name('upload-pdf')
    .description('Upload PDFs for visual comparison')
    .argument('<directory>', 'Path of the directory containing PDFs')
    .option('--fetch-results [filename]', 'Fetch results and optionally specify an output file, e.g., <filename>.json')
    .option('--buildName <string>', 'Specify the build name')
    .action(async function(directory, _, command) {
        const options = command.optsWithGlobals();
        if (options.buildName === '') {
            console.log(`Error: The '--buildName' option cannot be an empty string.`);
            process.exit(1);
        }
        let ctx: Context = ctxInit(command.optsWithGlobals());

        if (!fs.existsSync(directory)) {
            console.log(`Error: The provided directory ${directory} not found.`);
            return;
        }

        ctx.uploadFilePath = directory;

        let tasks = new Listr<Context>(
            [
                auth(ctx),
                uploadPdfs(ctx)
            ],
            {
                rendererOptions: {
                    icon: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: `→`
                    },
                    color: {
                        [ListrDefaultRendererLogLevels.OUTPUT]: color.gray as LoggerFormat
                    }
                }
            }
        );

        try {
            await tasks.run(ctx);

            if (ctx.options.fetchResults) {
                startPdfPolling(ctx);
            }
        } catch (error) {
            console.log('\nRefer docs: https://www.lambdatest.com/support/docs/smart-visual-regression-testing/');
        }
    });

export default command;