import { server, serverFileRouter } from "@/api"
import { filesystem } from "@rjweb/utils"
import fs from "fs"

server.schema('statFile', {
	type: 'object',
	properties: {
		name: { type: 'string' },
		type: { type: 'string', enum: ['file', 'directory'] },
		modified: { type: 'string', format: 'date-time' },
		size: { type: 'integer' }
	}, required: [
		'name', 'type', 'modified',
		'size'
	]
})

export = new serverFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Server Files',
			responses: {
				200: {
					description: 'Success',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									success: { type: 'boolean', const: true },
									files: { type: 'array', items: { $ref: '#/components/schemas/statFile' } }
								}, required: [
									'success', 'files'
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

			const files: { name: string, type: 'file' | 'directory', modified: Date, size: number }[] = []
			for await (const file of filesystem.walk(directory, { async: true })) {
				if (files.length >= 2000) break

				try {
					if (!file.isDirectory() && !file.isFile() && !file.isSymbolicLink()) continue
					const stat = await fs.promises.stat(file.path)

					files.push({
						name: file.name,
						type: stat.isDirectory() ? 'directory' : 'file',
						modified: stat.mtime,
						size: stat.size
					})
				} catch { }
			}

			return ctr.print({ success: true, files })
		})
	)