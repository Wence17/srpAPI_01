import { dynamicRoutePatterns, routeMeta, type RouteMeta } from './routeMeta'

export function resolveRouteMeta(path: string): RouteMeta | null {
  const exact = routeMeta[path]
  if (exact) return exact

  const dynamic = dynamicRoutePatterns.find((entry) => path.startsWith(entry.prefix))
  return dynamic?.meta ?? null
}
