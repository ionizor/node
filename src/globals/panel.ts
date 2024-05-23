import env from "@/globals/env"
import { DefaultApi } from "@/panel"

export default Object.assign(new DefaultApi({
	basePath: env.PANEL_URL,
	isJsonMime: () => true,
	apiKey: env.NODE_KEY
}), {
	authKey: ''
})