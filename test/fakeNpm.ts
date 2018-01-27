import { NpmWorld } from "../src/dependencyVersion/latestVersionFromNpm";

export const modulesInTheWorld: { [key: string]: string } = {};

function fakeLatestVersion(libraryName: string): Promise<string> {
    if (modulesInTheWorld[libraryName]) {
        return Promise.resolve(modulesInTheWorld[libraryName])
    }
    throw new Error("You didn't tell me what the latest version is for " + libraryName);
}


NpmWorld.latestVersion = fakeLatestVersion;
