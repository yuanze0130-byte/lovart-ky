import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/lovart',
        destination: '/',
        permanent: true,
      },
      {
        source: '/lovart/canvas',
        destination: '/canvas',
        permanent: true,
      },
      {
        source: '/lovart/projects',
        destination: '/projects',
        permanent: true,
      },
      {
        source: '/lovart/user',
        destination: '/user',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
