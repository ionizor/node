import { serverFileRouter } from "@/api"
import { filesystem } from "@rjweb/utils"
import fs from "fs"

export = new serverFileRouter.Path('/')
	.http('POST', '/', (http) => http
		.document({
			description: 'Pull Server File',
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
								id: { type: 'integer' },
								url: { type: 'string' },
								path: { type: 'string' }
							}, required: [
								'id', 'url', 'path'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				id: z.number(),
				url: z.string(),
				path: z.string()
			}))

			if (!infos) return

			const directory = await ctr["@"].data.getServerDiskPath(ctr["@"].server, infos.path)
			if (fs.existsSync(directory)) return ctr.print({ success: false, errors: ['File or Directory exists'] })

			ctr["@"].files.createPull(ctr["@"].server, infos.id, infos.path, infos.url)

			return ctr.print({ success: true })
		})
	)
	.http('POST', '/abort/{pull}', (http) => http
		.document({
			description: 'Abort Server File Pull',
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
			}, parameters: [
				{
					name: 'pull',
					in: 'path',
					description: 'Pull ID',
					required: true,
					schema: {
						type: 'integer'
					}
				}
			]
		})
		.onRequest(async(ctr) => {
			const id = parseInt(ctr.params.get('pull', ''))
			if (isNaN(id)) return ctr.print({ success: false, errors: ['Invalid pull'] })

			ctr["@"].files.abortPull(id)

			return ctr.print({ success: true })
		})
	)