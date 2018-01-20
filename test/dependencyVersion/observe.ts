import "mocha";
import * as assert from "power-assert";

import { pushedFingerprints } from "../fakePushFingerprints";
import { projectsInTheWorld } from "../fakeGitHubFile";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { RepoRef } from "@atomist/automation-client/operations/common/RepoId";
import * as graphql from "../../src/typings/types"
import { guid } from "@atomist/automation-client/internal/util/string";
import {
    AutomationClientVersionFingerprintName,
    FingerprintAutomationClientVersion,
} from "../../src/dependencyVersion/FingerprintAutomationClientVersion";
import * as stringify from "json-stringify-safe";
import { fakeContext } from "../fakeContext";



describe("How we know which repositories have which version", () => {

    describe("Fingerprint each commit with the version in package-lock-json", () => {
        it("on push, fingerprint is sent: automation-client-version=0.2.3", (done) => {
            // There exists a project with automation client version 0.2.3
            const projectThatUsesAutomationClient = automationClientProject("0.2.3");
            const afterSha = randomSha();
            projectsInTheWorld[afterSha] = projectThatUsesAutomationClient; // put this in the fake world
            // and we make a push to it
            const pushEvent = pushForFingerprinting(afterSha);
            eventArrives(pushEvent)
                .then(handlerResult => {
                    assert(handlerResult.code === 0, stringify(handlerResult));
                    // a fingerprint has been pushed
                    const pushedFingerprint = pushedFingerprints[afterSha];
                    assert(pushedFingerprint, "Nothing pushed for " + afterSha);
                    // with the right name
                    const myFingerprint = pushedFingerprint.fingerprints
                        .find(f => f.name == AutomationClientVersionFingerprintName);
                    assert(myFingerprint, "Didn't find it. " + stringify(pushedFingerprint));
                    // and the right value
                    assert(myFingerprint.sha === "0.2.3");
                })
                .then(() => done(), done);
        })
    })

});

/*
 * this is where I'd like to have a test framework.
 * I'm going to hard-code something instead.
 */
function eventArrives(event: graphql.PushForFingerprinting.Query): Promise<any> {
    const handlerThatWouldFire = new FingerprintAutomationClientVersion();
    handlerThatWouldFire.githubToken = "I AM A FAKE TOKEN";
    return handlerThatWouldFire.handle({ data: event } as any,
        fakeContext(),
        handlerThatWouldFire);
}


function randomSha() {
    return guid()
};

const pretendRepo: RepoRef = { owner: "satellite-of-love", repo: "tuvalu" };

function pushForFingerprinting(afterSha: string): graphql.PushForFingerprinting.Query {
    const push = {
        repo: { owner: pretendRepo.owner, name: pretendRepo.repo },
        after: { sha: afterSha },
    };
    return { Push: [push] }
}

function automationClientProject(automationClientVersion: string) {
    const project = InMemoryProject.from(pretendRepo,
        packageJson(automationClientVersion),
        packageLockJson(automationClientVersion));
    return project;

}

function packageJson(automationClientVersion: string): { path: "package.json", content: string } {
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
        content,
    }
}

function packageLockJson(automationClientVersion: string): { path: "package-lock.json", content: string } {
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
        "@atomist/microgrammar": "0.7.0"
      }
    }
  }
}
`;
    return {
        path: "package-lock.json",
        content,
    }
}