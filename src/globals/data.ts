import * as fs from "fs"
import path from "path"
import * as qemu from "@/globals/qemu"

/**
 * Get the Data Path for ionize
 * @since 0.1.0
*/ export function getPath(): string {
	if (!fs.existsSync('/var/lib/ionize')) fs.mkdirSync('/var/lib/ionize')

	return '/var/lib/ionize'
}

/**
 * Get the Temporary Path for ionize
 * @since 0.1.0
*/ export function getTempPath(): string {
	if (!fs.existsSync('/var/tmp/ionize')) fs.mkdirSync('/var/tmp/ionize')

	return '/var/tmp/ionize'
}

/**
 * Get the Data Path for a ionize Server
 * @since 0.1.0
*/ export function getServerPath(id: number): string {
	const path = `${getPath()}/servers/${id}`

	if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true })

	return path
}

/**
 * Get the Disk Path for a ionize Server
 * @since 0.1.0
*/ export async function getServerDiskPath(id: number, ...paths: string[]): Promise<string> {
	const serverPath = getServerPath(id)

	if (!fs.existsSync(path.join(serverPath, 'disk', 'dev'))) await qemu.mountDiskImage(id)

	return path.join(serverPath, 'disk', ...paths.map((p) => p.replaceAll('+', ' ').replace(/\.\./g, '')))
}