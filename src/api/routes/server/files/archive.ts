import { serverFileRouter } from "@/api"
import { filesystem } from "@rjweb/utils"
import fs from "fs"

export = new serverFileRouter.Path('/')
	.http('POST', '/', (http) => http
		.document({
			description: 'Archive Server Files',
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
								paths: { type: 'array', items: { type: 'string' } },
								type: { type: 'string', enum: ['zip', 'tar'] },
								destination: { type: 'string' }
							}, required: [
								'id', 'paths', 'type',
								'destination'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				id: z.number(),
				paths: z.string().array(),
				type: z.enum(['zip', 'tar']),
				destination: z.string()
			}))

			if (!infos) return

			const archive = await ctr["@"].data.getServerDiskPath(ctr["@"].server, infos.destination)
			if (fs.existsSync(archive)) return ctr.print({ success: false, errors: ['File or Directory exists'] })

			ctr["@"].files.createArchive(ctr["@"].server, infos.id, infos.paths, infos.type, infos.destination)

			return ctr.print({ success: true })
		})
	)
	.http('POST', '/abort/{archive}', (http) => http
		.document({
			description: 'Abort Server File Archive',
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
					name: 'archive',
					in: 'path',
					description: 'Archive ID',
					required: true,
					schema: {
						type: 'integer'
					}
				}
			]
		})
		.onRequest(async(ctr) => {
			const id = parseInt(ctr.params.get('archive', ''))
			if (isNaN(id)) return ctr.print({ success: false, errors: ['Invalid archive'] })

			ctr["@"].files.abortArchive(id)

			return ctr.print({ success: true })
		})
	)