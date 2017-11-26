import "mocha";

import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import * as assert from "power-assert";

const Creds = { token: "alsdkfjsdlkj" };
const RepoName = "dummy";
const Owner = "mannequin";

describe("GitProject cloning on filesystem", () => {

    const getAClone = (repoName: string = RepoName) => {
        const repositoryThatExists = new GitHubRepoRef(Owner, repoName);
        return GitCommandGitProject.cloned(Creds, repositoryThatExists);
    };

    it("does a test using that", () => {
       assert(true);
    });

});
