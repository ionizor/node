import env from "@/globals/env"
import logger from "@/globals/logger"
import { Middleware } from "rjweb-server"
import { z } from "zod"

type Zod = typeof import('zod')

export default new Middleware('internal-middlewares/zod', '1.0.0')
	.httpRequestContext((_, Original) => class extends Original {
		/**
		 * Validate the HTTP Body using a Zod object
		 * @since 0.1.0
		 * @from internal-middlewares
		*/ public async validateZod<Object extends z.ZodRawShape>(object: (zod: Zod) => Object, data?: any): Promise<z.infer<z.ZodObject<Object>> | null> {
			const status = z.object(object(z as Zod)).safeParse(data ?? await this.body())

			if (!status.success) {
				this.status(this.$status.UNPROCESSABLE_ENTITY).print({ success: false, errors: status.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
				this.skipRateLimit()

				if (env.LOG_LEVEL === 'debug') {
					logger()
						.text('Zod Validation Fail', (c) => c.red)
						.text('(http)', (c) => c.gray)
						.text('\n')
						.text(status.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'), (c) => c.red)
						.debug()
				}

				this.status(this.$status.UNPROCESSABLE_ENTITY).print({ success: false, errors: status.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })

				return null
			} else return status.data
		}
	})
	.wsMessageContext((_, Original) => class extends Original {
		/**
		 * Validate the Socket Body using a Zod object
		 * @since 0.1.0
		 * @from internal-middlewares
		*/ public validateZod<Objects extends readonly [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]>(objects: (zod: Zod) => Objects, data: any = this.message()): z.infer<z.ZodUnion<Objects>> | null {
			const status = z.union(objects(z as Zod)).safeParse(data)

			if (!status.success) {
				this.print('text', { type: 'error', errors: status.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })

				if (env.LOG_LEVEL === 'debug') {
					logger()
						.text('Zod Validation Fail', (c) => c.red)
						.text('(ws)', (c) => c.gray)
						.text('\n')
      			.text(status.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'), (c) => c.red)
						.debug()
				}

				return null
			} else return status.data
		}
	})
	.export()