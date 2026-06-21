import { appCacheDir, join } from '@tauri-apps/api/path'
import { load, Store } from '@tauri-apps/plugin-store'

async function getGlobalStore() {
  if ('__store__' in window) {
    return window['__store__'] as Store
  }
  const dir = await appCacheDir()
  const store = await load(await join(dir, '.settings.dat'))
  await store.save()
  // @ts-ignore
  window['__store__'] = store
  return store
}

export class SettingsStore<T = any> {
  name: string
  constructor(name: string) {
    this.name = name
  }

  getStore() {
    return getGlobalStore()
  }

  // get
  async get(): Promise<T | null> {
    const store = await this.getStore()
    const val = await store.get<T>(this.name)
    return val !== undefined ? val : null
  }

  // set
  async set(value: T): Promise<void> {
    const store = await this.getStore()
    await store.set(this.name, value)
    await store.save()
  }

  // clean
  async clear(): Promise<void> {
    const store = await this.getStore()
    await store.set(this.name, null)
  }
}

export { getGlobalStore }
