

import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";
import { Project } from "@atomist/automation-client/project/Project";
import * as graphql from "../../src/typings/types"

describe("How we know which repositories have which version", () => {

    describe("Fingerprint each commit with the current version", () => {

        it("Calls the fingerprint webhook on each commit", () => {
            eventArrives(pushForFingerprinting(automationClientProject("0.2.3")))
        })
    })

});

/*
 * this is where I'd like to have a test framework.
 * I'm going to hard-code something instead.
 */
function eventArrives(event: graphql.PushForFingerprinting.Query) {



}


const pretendRepo: RepoRef = { owner: "satellite-of-love", repo: "tuvalu" };

function pushForFingerprinting(after: Project): graphql.PushForFingerprinting.Query {
    const push = { repo: { owner: pretendRepo.owner, name: pretendRepo.repo }};
    return { Push: [push]}
}

function automationClientProject(automationClientVersion: string) {
    const project = InMemoryProject.from(pretendRepo,
        packageJson(automationClientVersion),
        packageLockJson(automationClientVersion));
    return project;

}

function packageJson(automationClientVersion: string): { path: "package.json", content: string} {
    const content = `{
  "name": "@satellite-of-love/tuvalu",
  "version": "0.1.2",
  "description": "Look I am an automation",
  "dependencies": {
    "@atomist/automation-client": "${automationClientVersion}",
    "moreStuff": "v0.2.3",
  }
}
`;
    return {
        path: "package.json",
        content
    }
}

function packageLockJson(automationClientVersion: string): { path: "package-lock.json", content: string} {
    const content = `{
  "name": "@atomist/upgrade-client-automation",
  "version": "0.1.2",
  "lockfileVersion": 1,
  "requires": true,
  "dependencies": {
    "@atomist/automation-client": {
      "version": "${automationClientVersion}",
      "integrity": "sha512-dS9/UEderhSNevVEGN7spPwyapkYFKw3Cp/0yJJs47sYA8EfQPVxeS0rJ2vuwhBjqjeCTCgfRFdlyodjUU5PAg==",
      "requires": {
        "@atomist/microgrammar": "0.7.0",
      }
    }
  }
}
`;
    return {
        path: "package-lock.json",
        content
    }
}