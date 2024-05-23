import panel from "@/globals/panel"
import { string, system } from "@rjweb/utils"
import env from "@/globals/env"
import logger from "@/globals/logger"
import fs from "fs"

export default function getVersion() {
	return `${JSON.parse(fs.readFileSync('../package.json', 'utf8')).version}:${system.execute('git rev-parse --short=10 HEAD').trim()}`
}

logger()
	.text('Starting Node', (c) => c.green)
	.text(getVersion(), (c) => c.cyan)
	.text('...')
	.info()

panel.apiNodeInfosGet().then((response) => {
	panel.authKey = string.hash(env.NODE_KEY.concat(response.data.secret), { algorithm: 'sha256' })

	logger()
		.text('Node Registered as', (c) => c.green)
		.text(response.data.node.name, (c) => c.cyan)
		.info()

	logger()
		.text('Node Auth Key')
		.text(panel.authKey, (c) => c.cyan)
		.debug()

	require('@/api')
	require('@/ssh')
})