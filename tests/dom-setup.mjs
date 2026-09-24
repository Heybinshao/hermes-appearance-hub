// jsdom 全局注入——必须在主线程、插件动态 import 之前完成（静态 import 顺序保证）。
// --experimental-loader 的钩子文件运行在 loader 线程，globalThis 不共享，故拆两文件。
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true
})
for (const k of ['window', 'document', 'navigator', 'localStorage', 'MutationObserver',
                 'StorageEvent', 'Event', 'CustomEvent', 'Node', 'HTMLElement', 'getComputedStyle',
                 'Storage']) {
  if (globalThis[k] === undefined && dom.window[k] !== undefined) {
    globalThis[k] = dom.window[k]
  }
}
export { dom }
