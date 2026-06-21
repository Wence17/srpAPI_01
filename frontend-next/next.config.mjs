const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendUrl}/api/:path*` },
      { source: '/v1/:path*', destination: `${backendUrl}/v1/:path*` },
      { source: '/setup/:path*', destination: `${backendUrl}/setup/:path*` },
    ]
  },
}

export default nextConfig
