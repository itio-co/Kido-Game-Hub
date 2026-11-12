import { version } from '../../package.json';
import buildInfo from '../../build.json';

export const appVersion = version;
export const appBuild = Number(buildInfo.number);

/** Shown next to the app version. Module versions stay on their own numbers. */
export function appVersionLabel(build = appBuild): string {
  return `${version} (build ${build})`;
}
