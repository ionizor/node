import { Connection, FileEntry, SFTPWrapper, utils } from "ssh2"
import fs from "fs"
import { resolve } from "path"

function join(...args: string[]) {
	const joined = args.filter((arg) => arg).join('/')
		.replace(/\.\./g, '').replace(/\/+/g, '/')

	return joined.startsWith('/') ? joined : `/${joined}`
}

async function sftpFile(disk: string, path: string): Promise<FileEntry> {
	const location = join(disk, path),
		stats = await fs.promises.stat(location)
			.catch(() => null)

	if (stats) {
		const type = stats.isDirectory() ? 'd' : stats.isFile() ? '-' : 'l'
		let mode = ''

		for (let i = 0; i < 3; i++) {
			mode += (stats.mode & (1 << (8 - i))) ? 'r' : '-'
			mode += (stats.mode & (1 << (5 - i))) ? 'w' : '-'
			mode += (stats.mode & (1 << (2 - i))) ? 'x' : '-'
		}

		const date = new Date(stats.mtimeMs),
			month = date.toLocaleString('default', { month: 'short' }),
			day = date.getDate(),
			hour = date.getHours(),
			minute = date.getMinutes()

		const relative = path.split('/').pop()!

		return {
			filename: relative,
			longname: `${type}${mode} ${stats.nlink} root root ${stats.size} ${month} ${day} ${hour}:${minute} ${relative}`,
			attrs: {
				mode: stats.mode,
				uid: stats.uid,
				gid: stats.gid,
				size: stats.size,
				atime: Math.floor(stats.atimeMs / 1000),
				mtime: Math.floor(stats.mtimeMs / 1000)
			}
		}
	} else {
		const relative = path.split('/').pop()!

		return {
			filename: relative,
			longname: `?????????? ? ? ? ? ? ${relative}`
		} as any
	}
}

type Handle = {
	path: string
	fd?: number
	stat?: fs.Stats
	closed: boolean
	pos: number
}

/**
 * Handle an SFTP Connection
 * @since 0.1.0
*/ export default function handle(disk: string, connection: SFTPWrapper, client: Connection) {
	const fileHandles = new Map<number, Handle>()

	function handleToFd(handle: Buffer): Handle {
		const int = handle.readUInt32BE(0)

		if (fileHandles.has(int)) return fileHandles.get(int)!
		return { path: '/', closed: true, pos: 0 }
	}
	
	function fdToHandle(path: string, fd?: number): Promise<Buffer & { stat?: fs.Stats }> {
		const buffer = Buffer.allocUnsafe(4)
		buffer.writeUInt32BE(fileHandles.size, 0)

		return new Promise((resolve) => {
			if (fd) {
				fs.fstat(fd, (err, stat) => {
					if (err) {
						fileHandles.set(fileHandles.size, { path: join(disk, path), closed: false, pos: 0 })
						resolve(buffer)
						return
					}

					fileHandles.set(fileHandles.size, { path: join(disk, path), fd, stat, closed: false, pos: 0 })
					resolve(Object.assign(buffer, { stat }))
				})
			} else {
				fs.stat(join(disk, path), (err, stat) => {
					if (err) {
						fileHandles.set(fileHandles.size, { path: join(disk, path), closed: false, pos: 0 })
						resolve(buffer)
						return
					}

					fileHandles.set(fileHandles.size, { path: join(disk, path), closed: false, pos: 0 })
					resolve(Object.assign(buffer, { stat }))
				})
			}
		})
	}

	connection.on('CLOSE', (reqId, handle) => {
		const fd = handleToFd(handle)
		if (fd.closed) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		fd.closed = true

		if (fd.fd) {
			fs.close(fd.fd, (err) => {
				if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

				connection.status(reqId, utils.sftp.STATUS_CODE.OK)
			})
		} else {
			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		}
	})

	connection.on('OPEN', (reqId, path, flags) => {
		fs.open(join(disk, path), utils.sftp.flagsToString(flags) ?? undefined, async(err, fd) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			const handle = await fdToHandle(path, fd)
			connection.handle(reqId, handle)
		})
	})

	connection.on('READ', async(reqId, handle, offset, length) => {
		const fd = handleToFd(handle)
		if (fd.closed || !fd.fd || !fd.stat) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		if (offset >= fd.stat.size) return connection.status(reqId, utils.sftp.STATUS_CODE.EOF)

		const size = fd.stat.size - fd.pos > length ? length : fd.stat.size - fd.pos,
			buffer = Buffer.allocUnsafe(size)

		fs.read(fd.fd, buffer, 0, size, offset, (err, bytesRead) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			fd.pos += size
			connection.data(reqId, buffer.subarray(0, bytesRead))
		})
	})

	connection.on('WRITE', (reqId, handle, offset, data) => {
		const fd = handleToFd(handle)
		if (fd.closed || !fd.fd) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		fs.write(fd.fd, data, 0, data.byteLength, offset, (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	connection.on('REALPATH', (reqId, path) => {
		const real = path.startsWith('.') ? '/' : resolve(path)

		connection.name(reqId, [{ filename: real, longname: real } as any])
	})

	connection.on('REMOVE', (reqId, path) => {
		fs.unlink(join(disk, path), (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	connection.on('MKDIR', (reqId, path) => {
		fs.mkdir(join(disk, path), (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	connection.on('RMDIR', (reqId, path) => {
		fs.rmdir(join(disk, path), (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	connection.on('OPENDIR', async(reqId, path) => {
		const handle = await fdToHandle(path)
		if (handle.stat && !handle.stat.isDirectory()) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		connection.handle(reqId, handle)
	})

	connection.on('READDIR', (reqId, handle) => {
		const fd = handleToFd(handle)
		if (fd.closed) return connection.status(reqId, utils.sftp.STATUS_CODE.EOF)
		if (fd.stat && !fd.stat.isDirectory()) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		fd.closed = true

		fs.readdir(fd.path, async(err, files) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			const pathWithoutDisk = fd.path.replace(disk, '/')
			const entries = await Promise.all(files.map((file) => sftpFile(disk, join(pathWithoutDisk, file))))

			connection.name(reqId, entries)
		})
	})

	connection.on('STAT', (reqId, path) => {
		fs.stat(join(disk, path), (err, stats) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.NO_SUCH_FILE)

			connection.attrs(reqId, {
				mode: stats.mode,
				uid: stats.uid,
				gid: stats.gid,
				size: stats.size,
				atime: Math.floor(stats.atimeMs / 1000),
				mtime: Math.floor(stats.mtimeMs / 1000)
			})
		})
	})

	connection.on('LSTAT', (reqId, path) => {
		fs.lstat(join(disk, path), (err, stats) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.NO_SUCH_FILE)

			connection.attrs(reqId, {
				mode: stats.mode,
				uid: stats.uid,
				gid: stats.gid,
				size: stats.size,
				atime: Math.floor(stats.atimeMs / 1000),
				mtime: Math.floor(stats.mtimeMs / 1000)
			})
		})
	})

	connection.on('SETSTAT', async(reqId, path, attrs) => {
		await Promise.allSettled([
			attrs.mode && fs.promises.chmod(join(disk, path), attrs.mode),
			attrs.uid && attrs.gid && fs.promises.chown(join(disk, path), attrs.uid, attrs.gid),
			attrs.atime && attrs.mtime && fs.promises.utimes(join(disk, path), attrs.atime, attrs.mtime)
		])

		connection.status(reqId, utils.sftp.STATUS_CODE.OK)
	})

	connection.on('FSTAT', (reqId, handle) => {
		const fd = handleToFd(handle)
		if (fd.closed || !fd.fd) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		fs.fstat(fd.fd, (err, stats) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.attrs(reqId, {
				mode: stats.mode,
				uid: stats.uid,
				gid: stats.gid,
				size: stats.size,
				atime: Math.floor(stats.atimeMs / 1000),
				mtime: Math.floor(stats.mtimeMs / 1000)
			})
		})
	})

	connection.on('FSETSTAT', (reqId, handle, attrs) => {
		const fd = handleToFd(handle)
		if (fd.closed || !fd.fd) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

		fs.fchmod(fd.fd, attrs.mode, (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			fs.fchown(fd.fd!, attrs.uid, attrs.gid, (err) => {
				if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

				fs.futimes(fd.fd!, attrs.atime, attrs.mtime, (err) => {
					if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

					connection.status(reqId, utils.sftp.STATUS_CODE.OK)
				})
			})
		})
	})

	connection.on('RENAME', (reqId, oldPath, newPath) => {
		fs.rename(join(disk, oldPath), join(disk, newPath), (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	connection.on('READLINK', (reqId, path) => {
		fs.readlink(join(disk, path), (err, link) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.NO_SUCH_FILE)

			connection.name(reqId, [{ filename: link, longname: link } as any])
		})
	})

	connection.on('SYMLINK', (reqId, targetPath, linkPath) => {
		fs.symlink(join(disk, targetPath), join(disk, linkPath), (err) => {
			if (err) return connection.status(reqId, utils.sftp.STATUS_CODE.FAILURE)

			connection.status(reqId, utils.sftp.STATUS_CODE.OK)
		})
	})

	client.once('end', () => {
		fileHandles.forEach((fd) => !fd.closed && fd.fd ? fs.close(fd.fd, () => {}) : null)
	})
}