import { Command } from 'commander'
import exec from './exec.js'
import { configWeb, configStatic, configFigma, configWebFigma} from './config.js'
import capture from './capture.js'
import upload from './upload.js'
import { version } from '../../package.json'
import { uploadFigma, uploadWebFigmaCommand  } from './uploadFigma.js'
import startServer from './server.js';
import stopServer from './stopServer.js'
import ping from './ping.js'
import mergeBranch from './mergeBranch.js'
import mergeBuild from './mergeBuild.js'

const program = new Command();

program
    .name('merge')
    .description('Merge a source branch into the target branch')
    .addCommand(mergeBranch)
    .addCommand(mergeBuild)

export default program;
