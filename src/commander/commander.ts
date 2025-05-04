import { Command } from 'commander'
import exec from './exec.js'
import { configWeb, configStatic, configFigma, configWebFigma, configAppFigma} from './config.js'
import capture from './capture.js'
import upload from './upload.js'
import { version } from '../../package.json'
import { uploadFigma, uploadWebFigmaCommand,uploadAppFigmaCommand  } from './uploadFigma.js'
import startServer from './server.js';
import stopServer from './stopServer.js'
import ping from './ping.js'
import mergeBranch from './mergeBranch.js'
import mergeBuild from './mergeBuild.js'

const program = new Command();

program
    .name('smartui')
    .description('CLI to help you run your SmartUI tests on LambdaTest platform')
    .version(`v${version}`)
    .option('-c --config <filepath>', 'Config file path')
    .addCommand(exec)
    .addCommand(capture)
    .addCommand(configWeb)
    .addCommand(configStatic)
    .addCommand(upload)
    .addCommand(startServer)
    .addCommand(stopServer)
    .addCommand(mergeBranch)
    .addCommand(mergeBuild)
    .addCommand(ping)
    .addCommand(configFigma)
    .addCommand(uploadFigma)
    .addCommand(configWebFigma)
    .addCommand(configAppFigma)
    .addCommand(uploadWebFigmaCommand)
    .addCommand(uploadAppFigmaCommand)



export default program;
