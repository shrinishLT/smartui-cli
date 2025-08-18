import { Server, IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { readFileSync, truncate } from 'fs'
import { Context } from '../types.js'
import { validateSnapshot } from './schemaValidation.js'
import { pingIntervalId } from './utils.js';
import { startPolling } from './utils.js';

export default async (ctx: Context): Promise<FastifyInstance<Server, IncomingMessage, ServerResponse>> => {
	
	const server: FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({
		logger: {
			level: 'debug',
			stream: { write: (message) => { ctx.log.debug(message) }}
		},
		bodyLimit: 30000000
	});
	const opts: RouteShorthandOptions = {};
	const SMARTUI_DOM = readFileSync(path.resolve(__dirname, 'dom-serializer.js'), 'utf-8');

	// healthcheck
	server.get('/healthcheck', opts, (_, reply) => {
		reply.code(200).send({ cliVersion: ctx.cliVersion })
	})

	// send dom serializer
	server.get('/domserializer', opts, (request, reply) => {
		reply.code(200).send({ data: { dom: SMARTUI_DOM }});
	});

	// process and upload snpashot
	server.post('/snapshot', opts, async (request, reply) => {
		let replyCode: number;
		let replyBody: Record<string, any>;

		try {
			let { snapshot, testType } = request.body;
			if (!validateSnapshot(snapshot)) throw new Error(validateSnapshot.errors[0].message);
		
			// Fetch sessionId from snapshot options if present
			const sessionId = snapshot?.options?.sessionId;
			let capsBuildId = ''
			const contextId = snapshot?.options?.contextId;

			if (sessionId) {
				// Check if sessionId exists in the map
				if (ctx.sessionCapabilitiesMap?.has(sessionId)) {
					// Use cached capabilities if available
					const cachedCapabilities = ctx.sessionCapabilitiesMap.get(sessionId);
					capsBuildId = cachedCapabilities?.buildId || ''
				} else {
					// If not cached, fetch from API and cache it
					try {
						let fetchedCapabilitiesResp = await ctx.client.getSmartUICapabilities(sessionId, ctx.config, ctx.git, ctx.log);
						capsBuildId = fetchedCapabilitiesResp?.buildId || ''
						ctx.log.debug(`fetch caps for sessionId: ${sessionId} are ${JSON.stringify(fetchedCapabilitiesResp)}`)
						if (capsBuildId) {
							ctx.sessionCapabilitiesMap.set(sessionId, fetchedCapabilitiesResp);
						} else if (fetchedCapabilitiesResp && fetchedCapabilitiesResp?.sessionId) {
							ctx.sessionCapabilitiesMap.set(sessionId, fetchedCapabilitiesResp);
						}
					} catch (error: any) {
						ctx.log.debug(`Failed to fetch capabilities for sessionId ${sessionId}: ${error.message}`);
						console.log(`Failed to fetch capabilities for sessionId ${sessionId}: ${error.message}`);
					}
				}

				if (capsBuildId && capsBuildId !== '') {
					process.env.SMARTUI_BUILD_ID = capsBuildId;
				}
			}

			ctx.testType = testType;
			
			if (contextId && !ctx.contextToSnapshotMap) {
				ctx.contextToSnapshotMap = new Map();
				ctx.log.info(`Initialized empty context mapping map for contextId: ${contextId}`);
			}
			
			if (contextId && ctx.contextToSnapshotMap) {
				ctx.contextToSnapshotMap.set(contextId, {
					snapshotName: '',
					buildId: '',
					snapshotUuid: ''
				});
				ctx.log.debug(`Added empty default values for contextId: ${contextId}`);
			}
			
			ctx.snapshotQueue?.enqueue(snapshot);
			ctx.isSnapshotCaptured = true;
			replyCode = 200;
			replyBody = { data: { message: "success", warnings: [] }};
		} catch (error: any) {
			ctx.log.debug(`snapshot failed; ${error}`)
			replyCode = 500;
			replyBody = { error: { message: error.message }}
		}
		
		return reply.code(replyCode).send(replyBody);
	});

	server.post('/stop', opts, async (_, reply) => {
		let replyCode: number;
		let replyBody: Record<string, any>;
		try {
			if(ctx.config.delayedUpload){
				ctx.log.debug("started after processing because of delayedUpload")
				ctx.snapshotQueue?.startProcessingfunc()
			}
			await new Promise((resolve) => {
				const intervalId = setInterval(() => {
					if (ctx.snapshotQueue?.isEmpty() && !ctx.snapshotQueue?.isProcessing()) {
						clearInterval(intervalId);
						resolve();
					}
				}, 1000);
			})
			await ctx.client.finalizeBuild(ctx.build.id, ctx.totalSnapshots, ctx.log);
			await ctx.browser?.close();
			if (ctx.server){
				ctx.server.close();
			}
			let resp = await ctx.client.getS3PreSignedURL(ctx);
            await ctx.client.uploadLogs(ctx, resp.data.url);

			if (pingIntervalId !== null) {
				clearInterval(pingIntervalId);
				ctx.log.debug('Ping polling stopped immediately.');
			}
			replyCode = 200;
			replyBody = { data: { message: "success", type: "DELETE" } };
		} catch (error: any) {
			ctx.log.debug(error);
			ctx.log.debug(`stop endpoint failed; ${error}`);
			replyCode = 500;
			replyBody = { error: { message: error.message } };
		}
	
		// Step 5: Return the response
		return reply.code(replyCode).send(replyBody);
	});

	// Add /ping route to check server status
	server.get('/ping', opts, (_, reply) => {
		reply.code(200).send({ status: 'Server is running', version: ctx.cliVersion });
	});

	// Get snapshot status
	server.get('/snapshot/status', opts, async (request, reply) => {
		let replyCode: number;
		let replyBody: Record<string, any>;

		try {
			const { contextId } = request.query as { contextId: string };
			ctx.log.debug("CONTEXT ID   : ", contextId);
			if (!contextId) {
				throw new Error('contextId is a required parameter');
			}

			// Check if we have stored snapshot details for this contextId
			if (ctx.contextToSnapshotMap?.has(contextId)) {
				const snapshotDetails = ctx.contextToSnapshotMap.get(contextId);
				ctx.log.debug("SNAPSHOT DETAILS   : ", snapshotDetails);
				
				// Wait until all required fields are available with polling
				let attempts = 0;
				const maxAttempts = 60; // 5 minutes max (60 * 5 seconds)
				
				while (!snapshotDetails?.buildId || !snapshotDetails?.snapshotName || !snapshotDetails?.snapshotUuid) {
					attempts++;
					if (attempts >= maxAttempts) {
						replyCode = 408;
						replyBody = { 
							error: { 
								message: 'Timeout waiting for snapshot details to be complete',
								data: {
									snapshotName: snapshotDetails?.snapshotName || 'pending',
									buildId: snapshotDetails?.buildId || 'pending',
									snapshotUuid: snapshotDetails?.snapshotUuid || 'pending'
								}
							}
						};
						return reply.code(replyCode).send(replyBody);
					}
					
					// Wait 5 seconds before next check
					await new Promise(resolve => setTimeout(resolve, 5000));
					
					// Refresh snapshot details from the map
					const updatedSnapshotDetails = ctx.contextToSnapshotMap.get(contextId);
					if (updatedSnapshotDetails && snapshotDetails) {
						Object.assign(snapshotDetails, updatedSnapshotDetails);
					}
					
					ctx.log.debug(`Attempt ${attempts}: Waiting for snapshot details to be complete...`);
				}
				
				ctx.log.debug("All snapshot details are now available:", snapshotDetails);

				// All fields are available, now poll external API until it returns 200
				// Poll external API until it returns 200
				let externalApiAttempts = 0;
				const maxExternalApiAttempts = 120; // 10 minutes max (120 * 5 seconds)
				
				while (true) {
					externalApiAttempts++;
					if (externalApiAttempts >= maxExternalApiAttempts) {
						replyCode = 408;
						replyBody = { 
							error: { 
								message: 'Timeout waiting for external API to return 200',
								data: {
									snapshotName: snapshotDetails.snapshotName,
									buildId: snapshotDetails.buildId,
									snapshotUuid: snapshotDetails.snapshotUuid
								}
							}
						};
						return reply.code(replyCode).send(replyBody);
					}
					
					try {
						// Make the external API call using the httpClient with URL params
						const externalResponse = await ctx.client.getSnapshotStatus(
							ctx.log, 
							snapshotDetails.buildId,
							snapshotDetails.snapshotName,
							snapshotDetails.snapshotUuid
						);
						
						if (externalResponse.statusCode === 200) {
							// External API returned 200, success! Return the response as-is
							replyCode = 200;
							replyBody = externalResponse.data || { 
								status: 'success',
								message: 'External API returned 200',
								data: {
									snapshotName: snapshotDetails.snapshotName,
									buildId: snapshotDetails.buildId,
									snapshotUuid: snapshotDetails.snapshotUuid
								}
							};
							return reply.code(replyCode).send(replyBody);
						} else if (externalResponse.statusCode === 202) {
							// External API returned 202, keep polling
							ctx.log.debug(`External API attempt ${externalApiAttempts}: Still processing (202), waiting 5 seconds...`);
							await new Promise(resolve => setTimeout(resolve, 5000));
						} else {
							// Unexpected response from external API
							ctx.log.debug(`Unexpected response from external API: ${JSON.stringify(externalResponse)}`);
							replyCode = 500;
							replyBody = { 
								error: { 
									message: `Unexpected response from external API: ${externalResponse.statusCode}`,
									externalApiStatus: externalResponse.statusCode
								}
							};
							return reply.code(replyCode).send(replyBody);
						}
					} catch (externalApiError: any) {
						ctx.log.debug(`External API call failed: ${externalApiError.message}`);
						replyCode = 500;
						replyBody = { 
							error: { 
								message: `External API call failed: ${externalApiError.message}`
							}
						};
						return reply.code(replyCode).send(replyBody);
					}
				}
			} else {
				// No snapshot found for this contextId
				replyCode = 404;
				replyBody = { error: { message: `No snapshot found for contextId: ${contextId}` } };
			}
		} catch (error: any) {
			ctx.log.debug(`snapshot status failed; ${error}`);
			replyCode = 500;
			replyBody = { error: { message: error.message } };
		}

		return reply.code(replyCode).send(replyBody);
	});


	await server.listen({ port: ctx.options.port });
	// store server's address for SDK
	let { port } = server.addresses()[0];
	process.env.SMARTUI_SERVER_ADDRESS = `http://localhost:${port}`;
	process.env.CYPRESS_SMARTUI_SERVER_ADDRESS = `http://localhost:${port}`;

	return server;
}
