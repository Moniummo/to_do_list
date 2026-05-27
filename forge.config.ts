import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const parseDevPort = (value: string | undefined, fallback: number): number => {
  const parsedValue = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const appVariant = process.env.TODO_APP_VARIANT?.trim().toLowerCase() === 'user'
  ? 'user'
  : 'dev';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: appVariant === 'user' ? 'To Do List' : 'To Do List Dev',
    executableName: appVariant === 'user' ? 'To Do List' : 'To Do List Dev',
    icon: './assets/app-icon',
    extraResource: ['./assets'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: './assets/app-icon.ico',
      loadingGif: './assets/installer-loading.gif',
      iconUrl: 'https://raw.githubusercontent.com/Moniummo/to_do_list/main/assets/app-icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Moniummo',
          name: 'to_do_list',
        },
        draft: false,
        prerelease: false,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      port: parseDevPort(process.env.TODO_WEBPACK_PORT, 3000),
      loggerPort: parseDevPort(process.env.TODO_WEBPACK_LOGGER_PORT, 9000),
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
