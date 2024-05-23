import { serverFileRouter } from "@/api"
import { filesystem } from "@rjweb/utils"
import fs from "fs"

export = new serverFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Server File Hashes',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true },
									hashes: {
										type: 'object',
										properties: {
											sha1: { type: 'string' },
											sha256: { type: 'string' },
											sha512: { type: 'string' },
											md5: { type: 'string' }
										}, required: [
											'sha1', 'sha256', 'sha512',
											'md5'
										]
									}
								}, required: [
									'success', 'hashes'
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

			if (!fs.existsSync(directory)) return ctr.print({ success: false, errors: ['File or Directory not found'] })

			const stat = await fs.promises.stat(directory)
			if (!stat.isFile()) return ctr.print({ success: false, errors: ['Not a file'] })

			const hashes = await filesystem.hash(directory, {
				algorithm: ['sha1', 'sha256', 'sha512', 'md5']
			})

			return ctr.print({ success: true, hashes })
		})
	)