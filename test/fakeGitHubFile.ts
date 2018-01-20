import { FileNotFound, GitHubFileWorld, RemoteFileLocation } from "../src/dependencyVersion/fetchOneFile";
import { Project } from "@atomist/automation-client/project/Project";
import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";


export const projectsInTheWorld: { [key: string]: Project } = {};

function fakeFetchGitHubFile(token: string, where: RemoteFileLocation, sha: string): Promise<string | FileNotFound> {
    const matchingProject = projectsInTheWorld[sha];
    if (!matchingProject) {
        return Promise.resolve(404 as FileNotFound)
    }
    if (!fitsLocation(where, matchingProject)) {
        return Promise.resolve(404 as FileNotFound);
    }
    return matchingProject.findFile(where.path)
        .then(f => f.getContent(),
            err => 404 as FileNotFound)
}

function fitsLocation(where: RemoteFileLocation, p: Project) {
    const repoRef: RepoRef = p.id;
    return repoRef.owner === where.owner &&
        repoRef.repo === where.name;
}

GitHubFileWorld.fetchFileContents = fakeFetchGitHubFile;