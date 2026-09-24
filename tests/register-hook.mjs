// 解析钩子（跑在 loader 线程，只做 bare-specifier → 桩的重定向，勿放副作用）
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)

export async function resolve(specifier, context, next) {
  if (specifier === '@hermes/plugin-sdk') {
    return { url: pathToFileURL(path.join(here, 'sdk-stub.mjs')).href, shortCircuit: true }
  }
  return next(specifier, context)
}
