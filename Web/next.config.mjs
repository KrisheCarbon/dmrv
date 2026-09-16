import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: path.join(__dirname, ".."),
  async redirects() {
    return [
      {
        source: "/network/farms",
        destination: "/network/farmers",
        permanent: false,
      },
      {
        source: "/network/farms/new",
        destination: "/network/farmers/new",
        permanent: false,
      },
      {
        source: "/network/farms/:id",
        destination: "/network/farmers/:id",
        permanent: false,
      },
      {
        source: "/network/farms/:id/edit",
        destination: "/network/farmers/:id/edit",
        permanent: false,
      },
      {
        source: "/network/fields",
        destination: "/network/farmers",
        permanent: false,
      },
      {
        source: "/network/soil-tests",
        destination: "/network/farmers",
        permanent: false,
      },
      {
        source: "/network/sensor-data",
        destination: "/biochar/sensor-data",
        permanent: false,
      },
      {
        source: "/biochar/farms",
        destination: "/biochar",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
