import { generalFileRouter } from "@/api"

export = new generalFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Servers',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: {
										type: 'boolean',
										const: true
									}, servers: {
										type: 'array',
										items: {
											type: 'number'
										}
									}
								}, required: [
									'success', 'servers'
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
				servers: await ctr["@"].lxc.getContainers()
			})
		})
	)
	.http('POST', '/', (http) => http
		.document({
			description: 'Create Server',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: {
										type: 'boolean',
										const: true
									}
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
								id: { type: 'integer' },
								image: {
									type: 'object',
									properties: {
										type: { type: 'string' },
										release: { type: 'string' }
									}, required: [
										'type', 'release'
									]
								}, template: { type: 'string' },
								cpu: { type: 'integer' },
								memory: { type: 'integer' },
								disk: { type: 'integer' }
							}, required: [
								'id', 'image', 'cpu',
								'memory', 'disk'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				id: z.number().int(),
				image: z.object({
					type: z.string(),
					release: z.string(),
				}), template: z.string().url().optional(),
				cpu: z.number().int().min(5).max(10000),
				memory: z.number().int().min(128),
				disk: z.number().int().min(768)
			}))

			if (!infos) return

			const images = ctr["@"].lxc.supportedImages[infos.image.type]
			if (!images || !images.includes(infos.image.release)) return ctr.status(ctr.$status.BAD_REQUEST).print({ success: false, errors: ['Invalid image'] })

			if ((await ctr["@"].lxc.getContainers()).includes(infos.id)) return ctr.status(ctr.$status.CONFLICT).print({ success: false, errors: ['Container already exists'] })

			await ctr["@"].lxc.createContainer(infos.id, infos.image, infos.template, {
				cpu: infos.cpu,
				memory: infos.memory,
				disk: infos.disk
			})

			return ctr.print({ success: true })
		})
	)