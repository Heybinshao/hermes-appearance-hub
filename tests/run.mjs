// npm test 入口：主线程按序做 jsdom 注入 → 注册解析钩子（register 阶段生效，
// 钩子与测试共享 globalThis，不依赖 loader 线程）。
import './dom-setup.mjs'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL(new URL('./register-hook.mjs', import.meta.url).pathname).href)
