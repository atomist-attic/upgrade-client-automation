import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";
import * as graphql from "../src/typings/types";


export type OneCommitInTheWorld = { files: { path: string, content: string }[] };
export type CommitSpecs =  { [key: string]: OneCommitInTheWorld }

export interface ProjectInTheWorld {
    repoRef: RepoRef,
    // sha -> files
    commits: CommitSpecs,
    latestSha: string,
    listEntry: graphql.ListAutomationClients.Repo
}
