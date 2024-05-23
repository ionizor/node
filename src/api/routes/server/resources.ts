import { serverFileRouter } from "@/api"

export = new serverFileRouter.Path('/')
	.http('PATCH', '/', (http) => http
		.document({
			description: 'Update Server Resources',
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
								cpu: { type: 'integer' },
								memory: { type: 'integer' }
							}, required: [
								'cpu', 'memory'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				cpu: z.number().int().min(5).max(10000),
				memory: z.number().int().min(128)
			}))

			if (!infos) return

			await ctr["@"].lxc.configureContainer(ctr["@"].server, infos)

			return ctr.print({ success: true })
		})
	)
	.http('PATCH', '/disk', (http) => http
		.document({
			description: 'Update Server Disk',
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
								size: { type: 'integer' }
							}, required: [
								'size'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				size: z.number().int().min(768)
			}))

			if (!infos) return

			try {
				await ctr["@"].qemu.resizeDiskImage(ctr["@"].server, infos.size)

				return ctr.print({ success: true })
			} catch {
				return ctr.status(ctr.$status.EXPECTATION_FAILED).print({ success: false, errors: ['Disk Usage higher than new size'] })
			}
		})
	)