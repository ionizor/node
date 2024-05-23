import { serverFileRouter } from "@/api"

export = new serverFileRouter.Path('/')
	.http('POST', '/', (http) => http
		.document({
			description: 'Set Server Allocations',
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
								allocations: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											ip: {
												oneOf: [
													{ type: 'string', format: 'ipv4' },
													{ type: 'null' }
												]
											}, port: {
												type: 'object',
												properties: {
													external: { type: 'integer', minimum: 79, maximum: 65535 },
													internal: { type: 'integer', minimum: 1, maximum: 65535 }
												}, required: [
													'external', 'internal'
												]
											}
										}, required: [
											'ip', 'port'
										]
									}
								}
							}, required: [
								'allocations'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				allocations: z.object({
					ip: z.string().ip({ version: 'v4' }).nullable(),
					port: z.object({
						external: z.number().int().min(79).max(65535),
						internal: z.number().int().min(1).max(65535)
					})
				}).array()
			}))

			if (!infos) return

			await ctr["@"].lxc.setupContainerAllocations(
				ctr["@"].server,
				infos.allocations.map((allocation) => [allocation.ip, allocation.port.external, allocation.port.internal] as [string, number, number])
			)

			return ctr.print({ success: true })
		})
	)