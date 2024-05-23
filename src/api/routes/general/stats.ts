import { generalFileRouter } from "@/api"
import { number, system } from "@rjweb/utils"
import os from "os"

const cpus = os.cpus(),
	name = cpus[0].model

export = new generalFileRouter.Path('/')
	.http('GET', '/', (http) => http
		.document({
			description: 'Get Node Stats',
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
									}, stats: {
										type: 'object',
										properties: {
											uptime: { type: 'number' },
											cpu: {
												type: 'object',
												properties: {
													cores: { type: 'number' },
													name: { type: 'string' },
													usage: { type: 'number' }
												}, required: [
													'cores', 'name', 'usage'
												]
											}, memory: {
												type: 'object',
												properties: {
													total: { type: 'number' },
													used: { type: 'number' }
												}, required: [
													'total', 'used'
												]
											}, disk: {
												type: 'object',
												properties: {
													total: { type: 'number' },
													used: { type: 'number' }
												}, required: [
													'total', 'used'
												]
											}
										}, required: [
											'uptime', 'cpu', 'memory',
											'disk'
										]
									}
								}, required: [
									'success', 'stats'
								]
							}
						}
					}
				}
			}
		})
		.onRequest(async(ctr) => {
			const [ cpuUsage, df ] = await Promise.all([
				system.cpu(),
				system.execute('df /', { async: true })
			])

			const diskUsed = parseFloat(df.split('\n')[1].split(' ').filter((v) => v)[2]) / 1024,
				diskTotal = parseFloat(df.split('\n')[1].split(' ').filter((v) => v)[3]) / 1024

			return ctr.print({
				success: true,
				stats: {
					uptime: os.uptime(),
					cpu: {
						cores: cpus.length,
						name,
						usage: number.round(cpuUsage, 2)
					}, memory: {
						total: Math.floor(os.totalmem() / 1024 / 1024),
						used: Math.floor((os.totalmem() - os.freemem()) / 1024 / 1024)
					}, disk: {
						total: diskTotal,
						used: diskUsed
					}
				}
			})
		})
	)