import { serverFileRouter } from "@/api"

export = new serverFileRouter.Path('/')
	.http('POST', '/', (http) => http
		.document({
			description: 'Update Server Status',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true }
								}, required: [
									'success'
								]
							}
						}
					}
				}
			}, requestBody: {
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: {
								status: { type: 'string', enum: ['START', 'STOP', 'FREEZE', 'UNFREEZE'] }
							}, required: [
								'status'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				status: z.union([ z.literal('START'), z.literal('STOP'), z.literal('FREEZE'), z.literal('UNFREEZE') ])
			}))

			if (!infos) return

			const status = await ctr["@"].lxc.getContainerStatus(ctr["@"].server)

			switch (infos.status) {
				case "START": {
					if (status === 'RUNNING') return ctr.print({ success: false, errors: ['Server is already running'] })
					await ctr["@"].lxc.startContainer(ctr["@"].server)

					break
				}

				case "STOP": {
					if (status === 'STOPPED') return ctr.print({ success: false, errors: ['Server is already stopped'] })
					await ctr["@"].lxc.stopContainer(ctr["@"].server)

					break
				}

				case "FREEZE": {
					if (status === 'FROZEN') return ctr.print({ success: false, errors: ['Server is already frozen'] })
					await ctr["@"].lxc.freezeContainer(ctr["@"].server)

					break
				}

				case "UNFREEZE": {
					if (status === 'RUNNING') return ctr.print({ success: false, errors: ['Server is already running'] })
					await ctr["@"].lxc.unfreezeContainer(ctr["@"].server)

					break
				}
			}

			return ctr.print({ success: true })
		})
	)