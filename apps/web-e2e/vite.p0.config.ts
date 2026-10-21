import base from '../web/vite.config'

const apiProxy = base.server?.proxy?.['/api']

// Run the production UI against the owned P0 API, leaving the developer's services alone.
export default {
  ...base,
  server: {
    ...base.server,
    proxy: {
      ...base.server?.proxy,
      '/api': { ...(typeof apiProxy === 'object' ? apiProxy : {}), target: process.env.WEB_E2E_API_URL },
      '/copilotkit': { target: process.env.WEB_E2E_CONTROL_URL },
    },
  },
}
