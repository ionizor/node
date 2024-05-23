import { serverFileRouter } from "@/api"
import fs from "fs"

export = new serverFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Server File Stat',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true },
									stat: { $ref: '#/components/schemas/statFile' }
								}, required: [
									'success', 'stat'
								]
							}
						}
					}
				}
			}, parameters: [
				{
					name: 'path',
					in: 'query',
					description: 'Path to list',
					required: false,
					schema: {
						type: 'string'
					}
				}
			]
		})
		.onRequest(async(ctr) => {
			const path = ctr.queries.get('path', '/'),
				directory = await ctr["@"].data.getServerDiskPath(ctr["@"].server, path)

			if (!fs.existsSync(directory)) return ctr.status(ctr.$status.NOT_FOUND).print({ success: false, errors: ['File or Directory not found'] })

			const stat = await fs.promises.stat(directory)

			return ctr.print({
				success: true,
				stat: {
					name: path,
					type: stat.isDirectory() ? 'directory' : 'file',
					modified: stat.mtime,
					size: stat.size
				}
			})
		})
	)