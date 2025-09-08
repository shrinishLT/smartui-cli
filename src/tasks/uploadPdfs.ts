import { ListrTask, ListrRendererFactory } from 'listr2';
import { Context } from '../types.js';
import chalk from 'chalk';
import { updateLogContext } from '../lib/logger.js';
import path from 'path';
import fs from 'fs';
import FormData from 'form-data';

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory> => {
    return {
        title: 'Uploading PDFs',
        task: async (ctx, task): Promise<void> => {
            try {
                ctx.task = task;
                updateLogContext({ task: 'upload-pdf' });

                // const pdfs = await getPdfsFromDirectory(ctx.uploadFilePath);
                // if (pdfs.length === 0) {
                //     throw new Error('No PDF files found in the specified directory');
                // }
                //
                // for (const pdf of pdfs) {
                //     task.output = `Uploading ${path.basename(pdf)}...`;
                //     await uploadPdfs(ctx, pdf);
                // }
                await uploadPdfs(ctx, ctx.uploadFilePath);

                task.title = 'PDFs uploaded successfully';
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(`${error.message}`);
                throw new Error('Uploading PDFs failed');
            }
        },
        rendererOptions: { persistentOutput: true },
        exitOnError: false
    };
};

async function getPdfsFromDirectory(directory: string): Promise<string[]> {
    const files = await fs.promises.readdir(directory);
    return files
        .filter(file => path.extname(file).toLowerCase() === '.pdf')
        .map(file => path.join(directory, file));
}

async function uploadPdfs(ctx: Context, pdfPath: string): Promise<void> {
    const formData = new FormData();
    const files = fs.readdirSync(pdfPath);
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));

    pdfFiles.forEach(pdf => {
        const filePath = path.join(pdfPath, pdf);
        formData.append('pathToFiles', fs.createReadStream(filePath));
    })

    // formData.append('pathToFiles', fs.createReadStream(pdfPath));
    // formData.append('name', path.basename(pdfPath, '.pdf'));

    const buildName = ctx.options.buildName;

    if (buildName) {
        ctx.build.name = buildName;
    }

    const response = await ctx.client.uploadPdf(ctx, formData, ctx.log, buildName);

    if (response && response.data && response.data.buildId) {
        ctx.build.id = response.data.buildId;
        ctx.log.debug(`PDF upload successful. Build ID: ${ctx.build.id}`);
    }
}