import { filesystem } from "@rjweb/utils"
import { z } from "zod"

let env: Record<string, string>
try {
	env = filesystem.env('../.env', { async: false })
} catch {
	try {
		env = filesystem.env('../../.env', { async: false })
	} catch {
		env = process.env as Record<string, string>
	}
}

const infos = z.object({
	PORT: z.string().transform((str) => parseInt(str)),
	SSH_PORT: z.string().transform((str) => parseInt(str)),

	NODE_KEY: z.string(),
	PANEL_URL: z.string().default('https://ui.ionizor.dev'),

	LOG_LEVEL: z.union([ z.literal('none'), z.literal('info'), z.literal('debug') ]),
	INTERFACE: z.string().default('eth0')
})

export type Environment = z.infer<typeof infos>

export default infos.parse(env)