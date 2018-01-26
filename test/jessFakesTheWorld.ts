import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";
import * as graphql from "../src/typings/types";

export interface ProjectInTheWorld {
    repoRef: RepoRef,
    files: { path: string, content: string }[],
    latestSha: string,
    listEntry: graphql.ListAutomationClients.Repo
}
