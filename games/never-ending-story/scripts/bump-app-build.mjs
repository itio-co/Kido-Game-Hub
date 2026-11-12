import { bumpBuildNumber } from './buildNumber.mjs';

const number = bumpBuildNumber();
console.log(`app build ${number}`);
