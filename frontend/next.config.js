/** @type {import("next").NextConfig} */
const nextConfig = {
  // The Docker image uses Next's standalone output; Vercel builds normally.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
};
module.exports = nextConfig;
