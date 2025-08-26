import { Command } from 'commander';
import * as http from 'http';
import * as https from 'https';
import chalk from 'chalk'

function getSmartUIServerAddress() {
    const serverAddress = process.env.SMARTUI_SERVER_ADDRESS || 'http://localhost:49152';
    return serverAddress;
}

function makeHttpRequest(url: string, timeout: number): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const req = client.request(url, { timeout }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                let parsedData;
                try {
                    parsedData = JSON.parse(data);
                } catch {
                    parsedData = data;
                }
                
                resolve({
                    status: res.statusCode || 0,
                    data: parsedData
                });
            });
        });
        
        req.on('error', (error) => {
            console.error(error)
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            const timeoutError = new Error('Request timeout');
            (timeoutError as any).code = 'ECONNABORTED';
            reject(timeoutError);
        });
        
        req.end();
    });
}

const command = new Command();

command
    .name('exec:pingTest')
    .description('Ping the SmartUI server to check if it is running using default http client')
    .action(async function(this: Command) {
        try {
            console.log(chalk.yellow("Pinging server using default http client..."));
            const serverAddress = getSmartUIServerAddress();
            console.log(chalk.yellow(`Pinging server at ${serverAddress} from terminal using default http client...`));

            // Send GET request to the /ping endpoint
            const response = await makeHttpRequest(`${serverAddress}/ping`, 15000);

            // Log the response from the server
            if (response.status === 200) {
                console.log(chalk.green('SmartUI Server is running'));
                console.log(chalk.green(`Response: ${JSON.stringify(response.data)}`)); // Log response data if needed
            } else {
                console.log(chalk.red('Failed to reach the server'));
            }
        } catch (error: any) {
            // Handle any errors during the HTTP request
            if (error.code === 'ECONNABORTED') {
                console.error(chalk.red('Error: SmartUI server did not respond in 15 seconds'));
            } else {
                console.error(chalk.red('SmartUI server is not running'));
                console.error(chalk.red(`Error: ${error?.code}`));  
                console.error(error);
            }
        }
    });

export default command;
