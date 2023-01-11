/* eslint-disable  @typescript-eslint/consistent-type-definitions */
import 'hardhat/types/runtime';
import { Helpers } from './helpers';

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    helpers: Helpers;
  }
}
