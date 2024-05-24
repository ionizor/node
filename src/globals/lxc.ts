import { system, time } from "@rjweb/utils"
import * as pty from "node-pty"
import * as qemu from "@/globals/qemu"
import * as fs from "fs"
import * as data from "@/globals/data"
import panel from "@/globals/panel"
import logger from "@/globals/logger"
import os from "os"
import env from "@/globals/env"

export type ContainerStatus = 'RUNNING' | 'STOPPED' | 'FROZEN' | 'ERROR'
export type Process = pty.IPty

export type Limits = {
	disk: number
	memory: number
	cpu: number
}

const cpus = os.cpus().length

export const onDelete: ((server: number) => void)[] = []
export const onStatusChange: ((server: number, status: ContainerStatus) => void)[] = []
export const installing = new Set<number>()

export const supportedImages: Record<string, string[]> = {
	UBUNTU: ['focal', 'jammy', 'noble'],
	DEBIAN: ['bullseye', 'bookworm', 'trixie']
}

/**
 * Generate an LXC Configuration File
 * @since 0.1.0
*/ export function generateLXCConfig(id: number, limits: Omit<Limits, 'disk'>): string {
	return `
lxc.include = /usr/share/lxc/config/common.conf
lxc.arch = linux64
lxc.uts.name = ion-${id}

lxc.cgroup.memory.limit_in_bytes = ${limits.memory}M
lxc.cgroup.cpu.cfs_quota_us = ${limits.cpu * 1000 * 2}
lxc.cgroup.cpu.cfs_period_us = 1000000
lxc.cgroup.devices.allow = a

lxc.rootfs.path = ${data.getServerPath(id)}/disk

lxc.net.0.type = veth
lxc.net.0.link = lxcbr0
lxc.net.0.flags = up
	`.trim()
}

/**
 * Get all LXC containers on the system
 * @since 0.1.0
*/ export async function getContainers(): Promise<number[]> {
	const data = await system.execute('lxc-ls', { async: true })
	const containers: number[] = []

	for (const line of data.split('\n')) {
		const match = line.match(/^ion-(\d+)/)
		if (match) containers.push(parseInt(match[1]))
	}

	return containers
}

/**
 * Create a new LXC container
 * @since 0.1.0
*/ export async function createContainer(id: number, image: { type: string, release: string }, template: string | undefined, config: Limits): Promise<void> {
	if ((await getContainers()).includes(id)) throw new Error('Container already exists')
	installing.add(id)

	setTimeout(async() => {
		try {
			try {
				await panel.apiNodeServerServerStatePost(id, {
					state: 'INSTALLING'
				})
			} catch { }

			await qemu.createDiskImage(id, config.disk, 'ext4', template)
			await qemu.mountDiskImage(id)

			const serverData = data.getServerPath(id)

			await fs.promises.writeFile(serverData.concat('/container.conf'), generateLXCConfig(id, config))

			await system.execute(`lxc-create -f ${serverData.concat('/container.conf')} -t download -n ion-${id} -- --dist ${image.type.toLowerCase()} --release ${image.release} --arch amd64`, { async: true })
			await fs.promises.writeFile(serverData.concat('/firstboot'), '')
			await startContainer(id, config.memory)
		} catch (error) {
			logger()
				.text('Failed to create container')
				.text(id, (c) => c.cyan)
				.text(`\n${error}`, (c) => c.red)
				.error()
		}
	}, 0)
}

/**
 * Delete a LXC container
 * @since 0.1.0
*/ export async function deleteContainer(id: number): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')
	onDelete.forEach((fn) => fn(id))

	try { await setupContainerAllocations(id, []) } catch { }
	try { await system.execute(`lxc-stop -n ion-${id}`, { async: true }) } catch { }
	try { await qemu.unmountDiskImage(id) } catch { }
	try { await system.execute(`lxc-destroy ion-${id}`, { async: true }) } catch { }

	await fs.promises.rm(data.getServerPath(id), { recursive: true, force: true })
}

/**
 * Configure a LXC container
 * @since 0.1.0
*/ export async function configureContainer(id: number, config: Omit<Limits, 'disk'>): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	const lxcConfig = data.getServerPath(id).concat('/container.conf')

	await fs.promises.writeFile(lxcConfig, generateLXCConfig(id, config))
	await fs.promises.writeFile(`/var/lib/lxc/ion-${id}/config`, generateLXCConfig(id, config))
}

/**
 * Start a LXC container
 * @since 0.1.0
*/ export async function startContainer(id: number, memory?: number, emit = true): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	await system.execute(`lxc-start -n ion-${id}`, { async: true })

	const path = data.getServerPath(id)
	if (fs.existsSync(path.concat('/firstboot')) && fs.existsSync(path.concat('/disk/mnt/server/script.sh'))) {
		async function run() {
			logger()
				.text('Running firstboot script for server', (c) => c.yellow)
				.text(id, (c) => c.cyan)
				.info()

			installing.add(id)
			await fs.promises.appendFile(path.concat('/disk/root/.bashrc'), '\ncd /mnt/server\n')

			await Promise.allSettled([
				fs.promises.rm(path.concat('/firstboot')),
				system.execute(`lxc-attach -n ion-${id} -- /bin/bash -c "cd /mnt/server; chmod +x script.sh; SERVER_MEMORY=${memory ?? 0} ./script.sh"`, { async: true }),
				panel.apiNodeServerServerStatePost(id, {
					state: 'INSTALLING'
				})
			])
	
			await Promise.allSettled([
				fs.promises.rm(path.concat('/disk/mnt/server/script.sh')),
				panel.apiNodeServerServerStatePost(id, {
					state: 'NEUTRAL'
				})
			])

			installing.delete(id)

			logger()
				.text('Firstboot script for server')
				.text(id, (c) => c.cyan)
				.text('ran successfully')
				.info()
		}

		run()
	}

	if (emit) onStatusChange.forEach((fn) => fn(id, 'RUNNING'))
	while (true) {
		const ip = await getContainerIP(id)
		if (ip === '-') {
			await time.wait(time(1).s())
			continue
		}

		try {
			await panel.apiNodeServerServerAllocationsGet(id).then(async({ data }) => {
				if (data.allocations.length) {
					await setupContainerAllocations(
						id,
						data.allocations.map((allocation) => [allocation.ip, allocation.port.external, allocation.port.internal])
					)
				}
			})
		} catch { }

		break
	}
}

/**
 * Stop a LXC container
 * @since 0.1.0
*/ export async function stopContainer(id: number, emit = true): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	if (emit) onStatusChange.forEach((fn) => fn(id, 'STOPPED'))

	await setupContainerAllocations(id, [])
	await system.execute(`lxc-stop -n ion-${id}`, { async: true })
}

/**
 * Freeze a LXC container
 * @since 0.1.0
*/ export async function freezeContainer(id: number, emit = true): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	if (emit) onStatusChange.forEach((fn) => fn(id, 'FROZEN'))
	await system.execute(`lxc-freeze -n ion-${id}`, { async: true })
}

/**
 * Unfreeze a LXC container
 * @since 0.1.0
*/ export async function unfreezeContainer(id: number, emit = true): Promise<void> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	if (emit) onStatusChange.forEach((fn) => fn(id, 'RUNNING'))
	await system.execute(`lxc-unfreeze -n ion-${id}`, { async: true })
}

/**
 * Get the IP address of a LXC container
 * @since 0.1.0
*/ export async function getContainerIP(id: number): Promise<string> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	const data = await system.execute(`lxc-ls -f`, { async: true }),
		lines = data.split('\n')

	return lines.find((line) => line.startsWith(`ion-${id}`))?.split(' ').filter((v) => v)[4] ?? ''
}

/**
 * Setup Network Allocations for a LXC container
 * @since 0.1.0
*/ export async function setupContainerAllocations(id: number, allocations: [ip: string | null, from: number, to: number][]) {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')
	if (await getContainerStatus(id) !== 'RUNNING') throw new Error('Container must be running to setup allocations')

	const containerIp = await getContainerIP(id)

	try {
		const old = await system.execute(`iptables -t nat -L PREROUTING --line-numbers -n -v | grep "ion-${id}"`, { async: true })

		for (const line of old.split('\n').reverse()) {
			const num = line.split(' ')[0]

			try {
				await system.execute(`iptables -t nat -D PREROUTING ${num}`, { async: true })
			} catch { }
		}
	} catch { }

	try {
		for (const [ ip, port, target ] of allocations) {
			//                                                                          this is test (-s)
			await system.execute(`iptables -t nat -A PREROUTING -i ${env.INTERFACE} ${ip ? `-s ${ip}` : ''} -p tcp --dport ${port} -j DNAT --to-destination ${containerIp}:${target} -m comment --comment "ion-${id}"`, { async: true })
		}

		await system.execute(`iptables -t nat -A POSTROUTING -j MASQUERADE`, { async: true })
	} catch { }
}

/**
 * Get the status of a LXC container
 * @since 0.1.0
*/ export async function getContainerStatus(id: number): Promise<ContainerStatus> {
	if (!(await getContainers()).includes(id)) return 'STOPPED'

	const data = await system.execute(`lxc-info -n ion-${id}`, { async: true })

	return data.includes('RUNNING')
		? 'RUNNING'
		: data.includes('STOPPED')
			? 'STOPPED'
			: data.includes('FROZEN')
				? 'FROZEN'
				: 'ERROR'
}

/**
 * Attach to a LXD container
 * @since 0.1.0
*/ export async function attachContainer(id: number, cols: number, rows: number): Promise<Process> {
	if (await getContainerStatus(id) !== 'RUNNING') throw new Error('Container is not running')

	const process = pty.spawn('/usr/bin/lxc-attach', ['-n', `ion-${id}`, '/bin/bash'], {
		name: 'xterm-256color',
		cols, rows
	})

	return process
}

/**
 * Get Stats of a LXD container
 * @since 0.1.0
*/ export async function getContainerStats(id: number): Promise<{
	status: ContainerStatus
	cpu: number
	memory: number
	disk: number
}> {
	if (!(await getContainers()).includes(id)) throw new Error('Container does not exist')

	const [ state, disk, cgroup ] = await Promise.all([
		getContainerStatus(id),
		qemu.diskUsage(id),
		new Promise<string>((resolve) => {
			const cmd = pty.spawn('systemd-cgtop', ['--depth=1', '--raw', '-p', `lxc.payload.ion-${id}`], {
				name: 'xterm-256color',
				cols: 80,
				rows: 24
			})

			let i = 0
			cmd.onData((data) => {
				i++

				if (i === 2) {
					resolve(data.split('\n')[1] ?? '')
					cmd.kill()
				}
			})
		})
	])

	const cpu = cgroup.split(' ').filter((v) => v)[2]?.trim() ?? '-',
		memory = cgroup.split(' ').filter((v) => v)[3]?.trim() ?? '0'

	return {
		status: state,
		cpu: (cpus * 100) / 100 * parseFloat(cpu === '-' ? '0' : cpu) / 4,
		memory: parseFloat(memory) / 1024 / 1024,
		disk
	}
}

/**
 * Listen for LXC container deletion events
 * @since 0.1.0
*/ export function listenDelete(listener: (server: number) => void, id?: number): { dispose(): void } {
	function eventOnDelete(server: number) {
		if (id && server !== id) return

		listener(server)
	}

	onDelete.push(eventOnDelete)

	return {
		dispose() {
			const index = onDelete.indexOf(eventOnDelete)
			if (index !== -1) onDelete.splice(index, 1)
		}
	}
}

/**
 * Listen for LXC container status change events
 * @since 0.1.0
*/ export function listenStatusChange(listener: (server: number, status: ContainerStatus) => void, id?: number): { dispose(): void } {
	function eventOnStatusChange(server: number, status: ContainerStatus) {
		if (id && server !== id) return

		listener(server, status)
	}

	onStatusChange.push(eventOnStatusChange)

	return {
		dispose() {
			const index = onStatusChange.indexOf(eventOnStatusChange)
			if (index !== -1) onStatusChange.splice(index, 1)
		}
	}
}