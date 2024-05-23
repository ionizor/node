import { serverFileRouter } from "@/api"
import fs from "fs"
import { join } from "path"

export = new serverFileRouter.Path('/')
	.http('POST', '/', (http) => http
		.document({
			description: 'Delete Server Files',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true },
									count: { type: 'integer' }
								}, required: [
									'success', 'count'
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
								paths: { type: 'array', items: { type: 'string' } }
							}, required: [
								'paths'
							]
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const infos = await ctr.validateZod((z) => ({
				paths: z.string().array()
			}))

			if (!infos) return

			let count = 0
			const root = await ctr["@"].data.getServerDiskPath(ctr["@"].server)
			for (const path of infos.paths) {
				try {
					await fs.promises.rm(join(root, path), { recursive: true, force: true })
					count++
				} catch { }
			}

			return ctr.print({ success: true, count })
		})
	)