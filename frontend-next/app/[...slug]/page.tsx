'use client'

import RouteGuard from '@/components/RouteGuard'

interface PageProps {
  params: {
    slug?: string[]
  }
}

export default function CatchAllPage({ params }: PageProps) {
  return <RouteGuard />
}
