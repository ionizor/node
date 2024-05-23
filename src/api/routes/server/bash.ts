import { serverFileRouter } from "@/api"
import { Process } from "@/globals/lxc"
import { time } from "@rjweb/utils"

export = new serverFileRouter.Path('/')
	.ws('/', (ws) => ws
		.context<{
			process: Process
			interval: NodeJS.Timeout
		}>()
		.onUpgrade(async(ctr, end) => {
			const cols = parseInt(ctr.queries.get('cols', '80'))
			if (isNaN(cols)) return end(ctr.status(ctr.$status.BAD_REQUEST).print({ success: false, errors: ['Invalid cols'] }))
			const rows = parseInt(ctr.queries.get('rows', '24'))
			if (isNaN(rows)) return end(ctr.status(ctr.$status.BAD_REQUEST).print({ success: false, errors: ['Invalid rows'] }))
			if (await ctr["@"].lxc.getContainerStatus(ctr["@"].server) !== 'RUNNING') return end(ctr.status(ctr.$status.CONFLICT).print({ success: false, errors: ['Container not running'] }))

			ctr["@"].process = await ctr["@"].lxc.attachContainer(ctr["@"].server, cols, rows)
		})
		.onOpen((ctr) => {
			ctr["@"].interval = setInterval(async() => {
				await ctr.print('text', { type: 'stats', ...await ctr["@"].lxc.getContainerStats(ctr["@"].server) })
			}, time(0.75).s())

			ctr["@"].process.onData(async(data) => {
				await ctr.print('text', { type: 'stdout', data })
			})

			ctr["@"].process.onExit(() => {
				ctr.close()
			})
		})
		.onMessage((ctr) => {
			const infos = ctr.validateZod((z) => [
				z.object({
					type: z.literal('stdin'),
					data: z.string()
				}),
				z.object({
					type: z.literal('resize'),
					rows: z.number().int().min(0),
					cols: z.number().int().min(0)
				})
			])

			if (!infos) return

			switch (infos.type) {
				case "stdin": {
					ctr["@"].process.write(infos.data)
					break
				}

				case "resize": {
					ctr["@"].process.resize(infos.cols, infos.rows)
					break
				}
			}
		})
		.onClose((ctr) => {
			ctr["@"].process.kill()
			clearInterval(ctr["@"].interval)
		})
	)