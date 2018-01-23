import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";

export interface ProjectInTheWorld {
    repoRef: RepoRef,
    files: { path: string, content: string }[],
    latestSha: string,
}
