import type { StratifyApi } from './index'

declare global {
  interface Window {
    api: StratifyApi
  }
}

export {}
