import type { Configuration } from 'webpack';
import webpack from 'webpack';
import dotenv from 'dotenv';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

dotenv.config();

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/index.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new webpack.DefinePlugin({
      TODO_BUILD_SUPABASE_URL: JSON.stringify(process.env.SUPABASE_URL?.trim() ?? ''),
      TODO_BUILD_SUPABASE_PUBLISHABLE_KEY: JSON.stringify(
        process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
      ),
      TODO_BUILD_EMERGENCY_POPUP_PASSWORDS: JSON.stringify(
        process.env.EMERGENCY_POPUP_PASSWORDS?.trim() ?? '',
      ),
      TODO_BUILD_APP_VARIANT: JSON.stringify(
        process.env.TODO_APP_VARIANT?.trim().toLowerCase() === 'user' ? 'user' : 'dev',
      ),
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};
