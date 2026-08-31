/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "borderless-browser-shell",
    ignore: [
      /^\/(?:\.github|design|out|src)(?:\/|$)/,
      /^\/(?:\.claude|scripts)(?:\/|$)/,
      /^\/(?:AGENTS\.md|README(?:[^/]*)?\.md|forge\.config\.cjs|package-lock\.json|\.gitignore|tsconfig\.json|vite\.config\.ts)$/,
      /^\/dist\/.*\.test\.js$/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32", "linux"],
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: { format: "ULFO", name: "Borderless Browser Preview" },
    },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "borderless_browser_shell_preview",
        authors: "Borderless Browser Shell contributors",
        description: "Preview build of the Borderless Browser Shell.",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: { options: { maintainer: "Borderless Browser Shell contributors" } },
    },
  ],
};
