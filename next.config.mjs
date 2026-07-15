/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "@napi-rs/canvas",
      "@tesseract.js-data/eng",
      "canvas",
      "pdfjs-dist",
      "tesseract.js"
    ]
  }
};

export default nextConfig;
