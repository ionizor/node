import { generalFileRouter } from "@/api"

export = new generalFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get SSH Informaton',
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
									}, infos: {
										type: 'object',
										properties: {
											hostname: {
												oneOf: [
													{ type: 'string' },
													{ type: 'null' }
												]
											}, port: { type: 'number' }
										}, required: [
											'hostname', 'port'
										]
									}
								}, required: [
									'success', 'infos'
								]
							}
						}
					}
				}
			}
		})
		.onRequest((ctr) => {
			return ctr.print({
				success: true,
				infos: {
					hostname: null,
					port: ctr["@"].env.SSH_PORT
				}
			})
		})
	)