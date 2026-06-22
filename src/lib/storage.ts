import { load } from '@tauri-apps/plugin-store'
import type { Store } from '@tauri-apps/plugin-store'
import { appCacheDir, join } from '@tauri-apps/api/path'

let globalStore: Store | null = null

async function getGlobalStore(): Promise<Store> {
  if (globalStore) {
    return globalStore
  }
  const dir = await appCacheDir()
  const fullPath = await join(dir, '.settings.dat')
  // load() creates a new store or loads the existing one
  globalStore = await load(fullPath, { defaults: {}, autoSave: false })
  return globalStore
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
    await store.save()
  }
}

export { getGlobalStore }
