import * as data from "@/globals/data"
import { system } from "@rjweb/utils"
import fs from "fs"

/**
 * Get the SSH Host Key
 * @since 0.1.0
*/ export function getHostKey(): Buffer {
	const key = data.getPath().concat('/ssh_host_rsa_key')

	if (!fs.existsSync(key)) {
		system.execute('ssh-keygen -t rsa -b 4096 -f '.concat(key), { async: false })
	}

	return fs.readFileSync(key)
}