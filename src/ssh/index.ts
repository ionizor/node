import env from "@/globals/env"
import logger from "@/globals/logger"
import getVersion from "@/index"
import { Server } from "ssh2"
import { version } from "ssh2/package.json"
import * as ssh from "@/globals/ssh"
import * as lxc from "@/globals/lxc"
import * as data from "@/globals/data"
import * as qemu from "@/globals/qemu"
import handleSFTP from "@/ssh/sftp"
import panel from "@/globals/panel"

const startTime = performance.now()

const server = new Server({
	hostKeys: [ssh.getHostKey()],
	ident: `ionizor-ssh node client ${getVersion()}`
})

// username schema
// <handle>.ion-<server>

server.on('connection', (client, info) => {
	let server: number | null = null,
		allowSSH = false,
		allowSFTP = false

	client.on('authentication', async(ctx) => {
		const [ handle, serverId ] = ctx.username.split('.ion-')
		if (!handle || !serverId) return ctx.reject(['none'])
		if (isNaN(parseInt(serverId))) return ctx.reject(['none'])

		const containers = await lxc.getContainers()
		if (!containers.includes(parseInt(serverId))) return ctx.reject(['none'])
		server = parseInt(serverId)

		switch (ctx.method) {
			case "password": {
				try {
					const { data } = await panel.apiNodeServerServerSshPost(server, {
						handle,
						auth: {
							type: 'password',
							value: ctx.password
						}
					})

					if (data.ssh || data.sftp) {
						allowSSH = data.ssh
						allowSFTP = data.sftp

						return ctx.accept()
					}
				} catch {
					return ctx.reject(['password', 'publickey'])
				}

				break
			}

			case "publickey": {
				try {
					const { data } = await panel.apiNodeServerServerSshPost(server, {
						handle,
						auth: {
							type: 'key',
							value: ctx.key.algo.concat(' ', ctx.key.data.toString('base64'))
						}
					})

					if (data.ssh || data.sftp) {
						allowSSH = data.ssh
						allowSFTP = data.sftp

						return ctx.accept()
					}
				} catch {
					return ctx.reject(['publickey', 'password'])
				}

				break
			}
		}

		ctx.reject(['password', 'publickey'])
	})

	client.on('ready', () => {
		client.on('session', (accept, reject) => {
			if (!server || lxc.installing.has(server)) return reject()
			const session = accept()

			session.on('pty', async(accept, reject, info) => {
				if (!allowSSH) return reject()

				session.on('shell', async(accept, reject) => {
					if (await lxc.getContainerStatus(server!) !== 'RUNNING') return reject()

					const stream = accept(),
						pty = await lxc.attachContainer(server!, info.cols, info.rows)
	
					pty.onData((data) => {
						stream.write(data)
					})
	
					pty.onExit(() => {
						stream.end()
					})

					session.on('window-change', (_, __, info) => {
						pty.resize(info.cols, info.rows)
					})
	
					stream.on('data', (data: string) => {
						pty.write(data)
					})
	
					stream.on('close', () => {
						pty.kill()
					})
				})

				accept()
			})

			session.on('exec', async(accept, reject, info) => {
				if (!allowSSH || await lxc.getContainerStatus(server!) !== 'RUNNING') return reject()
				const stream = accept()

				const pty = await lxc.attachContainer(server!, 10, 10)

				pty.onData((data) => {
					stream.write(data)
				})

				pty.onExit(() => {
					stream.end()
				})

				stream.on('data', (data: string) => {
					pty.write(data)
				})

				stream.on('close', () => {
					pty.kill()
				})

				pty.write(info.command)
				pty.write('\n')
				pty.write('exit\n')
			})

			session.on('sftp', async(accept, reject) => {
				if (!allowSFTP) return reject()
				const sftp = accept()

				const disk = await data.getServerDiskPath(server!)

				const listen = qemu.listenUnmountDisk(() => {
					client.end()
				}, server!)

				const listenStatus = lxc.listenStatusChange((_, status) => {
					if (status !== 'RUNNING') client.end()
				})

				handleSFTP(disk, sftp, client)

				session.on('close', () => {
					listen.dispose()
					listenStatus.dispose()
				})
			})
		})
	})
})

server.listen(env.SSH_PORT, '0.0.0.0', () => {
	logger()
		.text('SSH Server', (c) => c.blueBright)
		.text(`(${version}) started on port`)
		.text(env.SSH_PORT, (c) => c.cyan)
		.text(`(${(performance.now() - startTime).toFixed(1)}ms)`, (c) => c.gray)
		.info()
})