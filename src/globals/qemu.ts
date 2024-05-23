import * as data from "@/globals/data"
import * as lxc from "@/globals/lxc"
import { network, system } from "@rjweb/utils"
import fs from "fs"
import logger from "@/globals/logger"
import panel from "@/globals/panel"

export const onMount: ((server: number) => void)[] = []
export const onUnmount: ((server: number) => void)[] = []

/**
 * Create a new QEMU Disk Image
 * @since 0.1.0
*/ export async function createDiskImage(id: number, size: number, filesystem?: string, template?: string): Promise<string> {
	const path = data.getServerPath(id),
		mount = `${data.getTempPath()}/ion-${id}`

	logger()
		.text('Creating Disk Image')
		.text(`(id: ${id})`, (c) => c.cyan)
		.text(`(size: ${size}M)`, (c) => c.cyan)
		.text(`(filesystem: ${filesystem ?? 'none'})`, (c) => c.cyan)
		.text(`(template: ${template ?? 'none'})`, (c) => c.cyan)
		.debug()

	await system.execute(`qemu-img create -f raw ${path}/disk.img.tmp ${size}M`, { async: true })
	await system.execute(`cp --sparse=always ${path}/disk.img.tmp ${path}/disk.img`, { async: true })
	await fs.promises.rm(`${path}/disk.img.tmp`, { recursive: true })

	if (filesystem) {
		const loop = await system.execute(`losetup -fP --show ${path}/disk.img`, { async: true }).then((loop) => loop.trim())

		await system.execute(`mkfs.${filesystem} ${loop}`, { async: true })
		await system.execute(`tune2fs -m 0 ${loop}`, { async: true })
		await fs.promises.mkdir(mount, { recursive: true })
		await system.execute(`mount ${loop} ${mount}`, { async: true })
		await fs.promises.mkdir(`${mount}/mnt/server`, { recursive: true })
		await fs.promises.rm(`${mount}/lost+found`, { recursive: true })

		if (template) {
			await network.download(template, `${mount}/mnt/server/template.tar.gz`)
			await system.execute(`tar -xzf ${mount}/mnt/server/template.tar.gz -C ${mount}/mnt/server`, { async: true })
			await fs.promises.rm(`${mount}/mnt/server/template.tar.gz`)
		}

		await system.execute(`umount ${mount}`, { async: true })
		await fs.promises.rm(mount, { recursive: true })
		await system.execute(`losetup -d ${loop}`, { async: true })
	}

	logger()
		.text('Disk Image Created', (c) => c.green)
		.text(`(id: ${id})`, (c) => c.cyan)
		.debug()

	return `${path}/disk.img`
}

/**
 * Create a new QEMU Disk Image with LXD Rootfs
 * @since 0.1.0
*/ /*export async function createLxdDiskImage(id: number, size: number, image: string): Promise<[string, string]> {
	const base = data.getServerPath(id).concat('/disk.qcow2'),
		tmp = data.getTempPath(),
		cache = path.join(data.getPath(), 'cache', `${image.replace(':', '-')}.qcow2`),
		cache2 = path.join(data.getPath(), 'cache', `${image.replace(':', '-')}-metadata.img`)

	await fs.promises.mkdir(path.join(data.getPath(), 'cache'), { recursive: true })

	if (!fs.existsSync(cache) || !fs.existsSync(cache2)) {
		const id = string.generate()

		await fs.promises.mkdir(`${tmp}/${id}/qcow2`, { recursive: true })
		await fs.promises.mkdir(`${tmp}/${id}/rootfs`, { recursive: true })

		await system.execute(`lxc image export ${image} ${base}.img`, { async: true })
		await system.execute(`qemu-img create -f qcow2 ${cache} 1536M` , { async: true })

		const nbd = await getFreeNbd()
		await system.execute(`qemu-nbd --connect=/dev/nbd${nbd} ${cache}`, { async: true })
		await system.execute(`mkfs.ext4 /dev/nbd${nbd}`, { async: true })
		await system.execute(`mount /dev/nbd${nbd} ${tmp}/${id}/qcow2`, { async: true })

		await system.execute(`mount -o loop ${base}.img.root ${tmp}/${id}/rootfs`, { async: true })
		await system.execute(`rsync -a ${tmp}/${id}/rootfs/ ${tmp}/${id}/qcow2/`, { async: true })

		await system.execute(`umount ${tmp}/${id}/qcow2`, { async: true })
		await system.execute(`umount ${tmp}/${id}/rootfs`, { async: true })
		await system.execute(`qemu-nbd --disconnect /dev/nbd${nbd}`, { async: true })

		await fs.promises.copyFile(`${base}.img`, cache2)

		await fs.promises.rm(`${base}.img`, { recursive: true })
		await fs.promises.rm(`${base}.img.root`, { recursive: true })
		await fs.promises.rm(`${tmp}/${id}`, { recursive: true })
	}

	await fs.promises.copyFile(cache, base)
	await fs.promises.copyFile(cache2, `${base}.metadata`)
	await system.execute(`qemu-img resize ${base} ${size}M`, { async: true })

	return [base, `${base}.metadata`]
}*/

/**
 * Mount a QEMU Disk Image to a server
 * @since 0.1.0
*/ export async function mountDiskImage(id: number, mountPath?: string): Promise<string> {
	const path = data.getServerPath(id),
		image = `${path}/disk.img`,
		mount = mountPath ?? `${path}/disk`

	if (fs.existsSync(mount.concat('/mnt'))) return mount
	if (await lxc.getContainerStatus(id) !== 'STOPPED') throw new Error('Server must be stopped to mount disk image')

	await fs.promises.mkdir(mount, { recursive: true })
	await system.execute(`mount -o loop ${image} ${mount}`, { async: true })
	if (!fs.existsSync(mount.concat('/mnt/server'))) await fs.promises.mkdir(mount.concat('/mnt/server'), { recursive: true })
	onMount.forEach((fn) => fn(id))

	return mount
}

/**
 * Get the Mount Status of a QEMU Disk Image
 * @since 0.1.0
*/ export async function diskMountStatus(id: number): Promise<boolean> {
	const path = data.getServerPath(id),
		mount = `${path}/disk`

	return fs.existsSync(mount.concat('/mnt'))
}

/**
 * Get the Disk Loop Device of a QEMU Disk Image
 * @since 0.1.0
*/ export async function diskLoopDevice(id: number): Promise<`/dev/loop${number}`> {
	const path = data.getServerPath(id),
		image = `${path}/disk.img`

	return system.execute(`losetup -j ${image}`, { async: true })
		.then((loop) => loop.split(': ')[0]) as Promise<`/dev/loop${number}`>
}

/**
 * Get the Disk Usage of a QEMU Disk Image
 * @since 0.1.0
*/ export async function diskUsage(id: number): Promise<number> {
	let wasMounted = false

	if (!await diskMountStatus(id)) {
		await mountDiskImage(id)
		wasMounted = false
	} else {
		wasMounted = true
	}

	const loop = await diskLoopDevice(id),
		fsOut = await system.execute(`tune2fs -l ${loop}`, { async: true }),
		blockCount = fsOut.split('\n').find((line) => line.startsWith('Block count:'))?.split(':')?.[1]?.trim() ?? '0',
		blockSize = fsOut.split('\n').find((line) => line.startsWith('Block size:'))?.split(':')?.[1]?.trim() ?? '0',
		freeBlocks = fsOut.split('\n').find((line) => line.startsWith('Free blocks:'))?.split(':')?.[1]?.trim() ?? '0'

	if (!wasMounted) await unmountDiskImage(id)

	return (parseFloat(blockCount) - parseFloat(freeBlocks)) * parseFloat(blockSize) / 1024 / 1024
}

/**
 * Get the Disk Size of a QEMU Disk Image
 * @since 0.1.0
*/ export async function diskSize(id: number): Promise<number> {
	const path = data.getServerPath(id),
		image = `${path}/disk.img`

	const size = await system.execute(`qemu-img info ${image}`, { async: true })
		.then((info) => parseFloat(info.split('\n').find((line) => line.startsWith('virtual size:'))?.split('(')?.[1]?.trim() ?? '0'))

	return size / 1024 / 1024
}

/**
 * Unmount a QEMU Disk Image from a server
 * @since 0.1.0
*/ export async function unmountDiskImage(id: number, mountPath?: string): Promise<void> {
	if (await lxc.getContainerStatus(id) !== 'STOPPED') throw new Error('Server must be stopped to unmount disk image')

	const path = data.getServerPath(id),
		mount = mountPath ?? `${path}/disk`

	if (!fs.existsSync(mount.concat('/dev'))) return

	onUnmount.forEach((fn) => fn(id))
	await system.execute(`umount -d ${mount}`, { async: true })
	await fs.promises.rm(mount, { recursive: true, force: true })
}

/**
 * Resize a QEMU Disk Image
 * @since 0.1.0
*/ export async function resizeDiskImage(id: number, size: number): Promise<void> {
	const old = await diskUsage(id) + 128

	if (old > size) throw new Error('Cannot shrink disk image')

	const mount = await mountDiskImage(id)

	await panel.apiNodeServerServerStatePost(id, {
		state: 'CONFIGURING'
	})

	setTimeout(async() => {
		try {
			const status = await lxc.getContainerStatus(id)
			if (status !== 'STOPPED') await lxc.stopContainer(id)

			const oldSize = await diskSize(id)

			if (!fs.existsSync(`${mount}/lost+found`)) await fs.promises.mkdir(`${mount}/lost+found`)
			await unmountDiskImage(id)
			const loop = await system.execute(`losetup -fP --show ${mount}.img`, { async: true }).then((loop) => loop.trim())

			await system.execute(`e2fsck -y -f ${loop}`, { async: true })
			if (oldSize > size) await system.execute(`resize2fs ${loop} ${size - 128}M`, { async: true })

			await system.execute(`qemu-img resize -f raw ${oldSize > size ? '--shrink' : ''} ${mount}.img ${size}M`, { async: true })
			await system.execute(`e2fsck -y -f ${loop}`, { async: true })

			await system.execute(`losetup -d ${loop}`, { async: true })
			await system.execute(`resize2fs ${data.getServerPath(id)}/disk.img`, { async: true })

			await mountDiskImage(id)
			await fs.promises.rm(`${mount}/lost+found`, { recursive: true })

			try {
				await panel.apiNodeServerServerStatePost(id, {
					state: 'NEUTRAL'
				})
			} catch { }

			if (status === 'RUNNING') await lxc.startContainer(id)
		} catch (error) {
			logger()
				.text('Failed to resize container disk image')
				.text(id, (c) => c.cyan)
				.text(`\n${error}`, (c) => c.red)
				.error()
		}
	}, 0)
}

/**
 * Listen for QEMU Disk Image Mount Events
 * @since 0.1.0
*/ export function listenMountDisk(listener: (server: number) => void, id?: number): { dispose(): void } {
	function eventOnMount(server: number) {
		if (id && server !== id) return

		listener(server)
	}

	onMount.push(eventOnMount)

	return {
		dispose() {
			const index = onMount.indexOf(eventOnMount)
			if (index !== -1) onMount.splice(index, 1)
		}
	}
}

/**
 * Listen for QEMU Disk Image Unmount Events
 * @since 0.1.0
*/ export function listenUnmountDisk(listener: (server: number) => void, id?: number): { dispose(): void } {
	function eventOnUnmount(server: number) {
		if (id && server !== id) return

		listener(server)
	}

	onUnmount.push(eventOnUnmount)

	return {
		dispose() {
			const index = onUnmount.indexOf(eventOnUnmount)
			if (index !== -1) onUnmount.splice(index, 1)
		}
	}
}