import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import './assets/main.css'
import { reportError } from './utils/errorReporting'

const app = createApp(App)

// Errors outside rendering (button handlers, watchers, async actions) show a toast instead of failing silently.
app.config.errorHandler = (err, _instance, info) => reportError(err, info)

app.use(createPinia())
app.use(router)

app.mount('#app')
