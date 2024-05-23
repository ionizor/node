import * as data from "@/globals/data"
import fs from "fs"
import panel from "@/globals/panel"
import { filesystem, time } from "@rjweb/utils"
import archiver from "archiver"
import { join } from "path"

export const pulls: Map<number, [server: number, progress: number, size: number | undefined, done: boolean, abort: AbortController]> = new Map()
export const archives: Map<number, [server: number, progress: number, size: number | undefined, done: boolean, abort: AbortController]> = new Map()

let pullIntervalRunning = false
setInterval(async() => {
	if (pullIntervalRunning) return
	pullIntervalRunning = true

	try {
		for (const [ id, [ server, progress, size, done ] ] of pulls) {
			try {
				await panel.apiNodeServerServerFilesPullPost(server, {
					id, progress, size, done
				})
			} catch { }

			if (done) pulls.delete(id)
		}
	} catch { }

	pullIntervalRunning = false
}, time(2).s())

let archiveIntervalRunning = false
setInterval(async() => {
	if (archiveIntervalRunning) return
	archiveIntervalRunning = true

	try {
		for (const [ id, [ server, progress, size, done ] ] of archives) {
			try {
				await panel.apiNodeServerServerFilesArchivePost(server, {
					id, progress, size, done
				})
			} catch { }

			if (done) archives.delete(id)
		}
	} catch { }

	archiveIntervalRunning = false
}, time(2).s())

/**
 * Create a new file pull
 * @since 0.1.0
*/ export async function createPull(id: number, pull: number, path: string, url: string): Promise<number> {
	const location = await data.getServerDiskPath(id, path)

	const abort = new AbortController(),
		fetched = await fetch(url, { signal: abort.signal })

	if (!fetched.body) throw new Error('Failed to fetch file')

	const stream = fs.createWriteStream(location)

	abort.signal.addEventListener('abort', async() => {
		stream.close()
		try { await fs.promises.rm(location) } catch { }
	})

	stream.on('error', () => {
		abort.abort()
		stream.close()
	})

	try {
		pulls.set(pull, [id, 0, parseInt(fetched.headers.get('content-length') ?? '0') || undefined, false, abort])
		for await (const raw of fetched.body as any as AsyncIterable<Uint8Array>) {
			if (abort.signal.aborted) break

			const chunk = Buffer.from(raw)

			await new Promise((resolve) => stream.write(chunk, resolve))

			const current = pulls.get(pull)
			if (!current) continue

			current[1] += chunk.byteLength
			pulls.set(pull, current)
		}

		stream.end()

		const current = pulls.get(pull)
		if (!current) return pull

		current[3] = true
		pulls.set(pull, current)

		if (abort.signal.aborted) throw 1

		return pull
	} catch {
		stream.close()
		try { await fs.promises.rm(location) } catch { }

		return pull
	}
}

/**
 * Abort a file pull
 * @since 0.1.0
*/ export function abortPull(pull: number) {
	const current = pulls.get(pull)
	if (!current) return

	try {
		current[4].abort()
		current[3] = true

		pulls.set(pull, current)
	} catch { }
}

/**
 * Create a new archive
 * @since 0.1.0
*/ export async function createArchive(id: number, archive: number, paths: string[], type: 'zip' | 'tar', destination: string): Promise<void> {
	const location = await data.getServerDiskPath(id, destination),
		root = await data.getServerDiskPath(id),
		controller = new AbortController()

	const stream = archiver(type),
		write = fs.createWriteStream(location)

	stream.pipe(write)

	stream.on('error', () => {
		controller.abort()
		stream.end()
	})

	write.on('error', () => {
		controller.abort()
		stream.end()
	})

	controller.signal.addEventListener('abort', async() => {
		stream.end()
		try { await fs.promises.rm(location) } catch { }
	})

	archives.set(archive, [id, 0, undefined, false, controller])

	let total = 0
	for (const path of paths) {
		try {
			const stat = await fs.promises.lstat(join(root, path))
			if (!stat.isFile() && !stat.isDirectory()) continue

			if (stat.isDirectory()) {
				for await (const file of filesystem.walk(join(root, path), { recursive: true })) {
					if (controller.signal.aborted) break

					total++
				}
			} else {
				total++
			}
		} catch {
			paths.splice(paths.indexOf(path), 1)
		}
	}

	archives.set(archive, [id, 0, total, false, controller])

	stream.on('progress', (data) => {
		const current = archives.get(archive)
		if (!current) return

		current[1] = data.entries.processed
		archives.set(archive, current)
	})

	stream.on('end', () => {
		const current = archives.get(archive)
		if (!current) return

		current[3] = true
		archives.set(archive, current)
	})

	for (const path of paths) {
		try {
			const stat = await fs.promises.lstat(join(root, path))
			if (!stat.isFile() && !stat.isDirectory()) continue

			if (stat.isDirectory()) {
				stream.directory(join(root, path).concat('/'), path)
			} else {
				stream.file(join(root, path), { name: path })
			}
		} catch { }
	}

	await stream.finalize()
}

/**
 * Abort an archive
 * @since 0.1.0
*/ export function abortArchive(archive: number) {
	const current = archives.get(archive)
	if (!current) return

	try {
		current[4].abort()
		current[3] = true

		archives.set(archive, current)
	} catch { }
}