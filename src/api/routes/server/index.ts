import { serverFileRouter } from "@/api"

export = new serverFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Server Stats',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true },
									stats: {
										type: 'object',
										properties: {
											status: { type: 'string' },
											cpu: { type: 'number' },
											memory: { type: 'number' },
											disk: { type: 'number' }
										}, required: [
											'status', 'cpu', 'memory',
											'disk'
										]
									}
								}, required: [
									'success', 'stats'
								]
							}
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			return ctr.print({
				success: true,
				stats: await ctr["@"].lxc.getContainerStats(ctr["@"].server)
			})
		})
	)
	.http('DELETE', '/', (http) => http
		.document({
			description: 'Delete Server',
			responses: {
				200: {
					description: 'Server deleted',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: {
										type: 'boolean',
										const: true
									}
								}
							}
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			await ctr["@"].lxc.deleteContainer(ctr["@"].server)

			return ctr.print({ success: true })
		})
	)