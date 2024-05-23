import { Server, version } from "rjweb-server"
import { Runtime } from "@rjweb/runtime-node"
import * as lxc from "@/globals/lxc"
import panel from "@/globals/panel"
import * as data from "@/globals/data"
import * as files from "@/globals/files"
import * as qemu from "@/globals/qemu"
import logger from "@/globals/logger"
import getVersion from "@/index"
import env from "@/globals/env"

import Mzod from "@/api/middlewares/zod"

const startTime = performance.now()

export const server = new Server(Runtime, {
  port: env.PORT
}, [
  Mzod.use({})
], {
  lxc,
  data,
  panel,
  files,
  qemu,
  env
})

const panelValidator = new server.Validator()
  .document({
    security: [
			{
				api_key: []
			}
		]
  })
	.httpRequest((ctr, end) => {
    const data = ctr.headers.get('authorization', ctr.queries.get('authorization', ''))

		if (!data) return end(ctr.status(ctr.$status.BAD_REQUEST).print({ success: false, errors: ['No Authorization header'] }))
		if (data !== panel.authKey) return end(ctr.status(ctr.$status.UNAUTHORIZED).print({ success: false, errors: ['Invalid Authorization header'] }))
	})

export const serverFileRouter = new server.FileLoader('/api/servers/{server}')
  .validate(new server.Validator()
    .extend(panelValidator)
    .document({
      parameters: [
        {
          in: 'path',
          name: 'server',
          required: true,
          description: 'The ID of the server to interact with',
          schema: {
            type: 'number'
          }
        }
      ]
    })
    .context<{
      server: number
    }>()
    .httpRequest(async(ctr, end) => {
      if (isNaN(parseInt(ctr.params.get('server')!))) return end(ctr.status(ctr.$status.BAD_REQUEST).print({ success: false, errors: ['Invalid ID parameter'] }))

      ctr["@"].server = parseInt(ctr.params.get('server')!)

      if (!(await ctr["@"].lxc.getContainers()).includes(ctr["@"].server)) return end(ctr.status(ctr.$status.NOT_FOUND).print({ success: false, errors: ['Container not found'] }))
    })
    .use({})
  )
  .load('api/routes/server', { fileBasedRouting: true })
  .export()

export const generalFileRouter = new server.FileLoader('/api')
  .validate(panelValidator.use({}))
  .load('api/routes/general', { fileBasedRouting: true })
  .export()

server.path('/', (path) => path
  .http('GET', '/api/openapi', (http) => http
    .onRequest((ctr) => {
      const openAPI = server.openAPI('ionizor node openapi docs', getVersion(), {
        url: `https://localhost:${server.port()}`
      })

      openAPI.components = {
        ...openAPI.components,
        securitySchemes: {
          api_key: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            scheme: 'token'
          }
        }
      }

      return ctr.print(openAPI)
    })
  )
)

server.http((ctr) => {
  logger()
    .text(`${ctr.type.toUpperCase()} ${ctr.url.method}`, (c) => c.green)
    .text(':')
    .text(ctr.url.href, (c) => c.green)
    .text(ctr.client.ip.usual(), (c) => c.cyan)
    .text(ctr.client.proxied ? '(proxied)' : '(raw)', (c) => c.gray)
    .info()
})

server.notFound((ctr) => {
  return ctr.status(ctr.$status.NOT_FOUND).print({ success: false, errors: ['Route not found'] })
})

server.finish('httpRequest', (ctr) => {
  logger()
    .text(`${ctr.context.response.status} ${ctr.url.method}`, (c) => c.green)
    .text(':')
    .text(ctr.url.href, (c) => c.green)
    .text(ctr.client.ip.usual(), (c) => c.cyan)
    .text(ctr.client.proxied ? '(proxied)' : '(raw)', (c) => c.gray)
    .text(`${ctr.context.elapsed().toFixed(1)}ms`, (c) => c.gray)
    .debug()
})

server.start()
  .then((port) => {
    logger()
      .text('HTTP Server', (c) => c.redBright)
      .text(`(${version}) started on port`)
      .text(port, (c) => c.cyan)
      .text(`(${(performance.now() - startTime).toFixed(1)}ms)`, (c) => c.gray)
      .info()
  })
  .catch((err: Error) => {
    logger()
      .text('HTTP Server', (c) => c.redBright)
      .text('failed starting')
      .text('\n')
      .text(err.stack!, (c) => c.red)
      .error()
  })