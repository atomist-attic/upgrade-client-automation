// fetch the latest version number of a module from NPM
const latestVersion = require('latest-version');

export const NpmWorld = {
    latestVersion: latestVersionImpl,
};

function latestVersionImpl(library: string): Promise<string> {
    return latestVersion(library);
}
