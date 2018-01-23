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
    FingerprintAutomationClientVersion, NotAnAutomationClient,
} from "../../src/dependencyVersion/FingerprintAutomationClientVersion";
import * as stringify from "json-stringify-safe";
import { fakeContext } from "../fakeContext";
import { HandlerContext } from "@atomist/automation-client";
import { listAutomationClientsCommand } from "../../src/dependencyVersion/ListAutomationClients";


describe("Observe: which automation clients are on each version", () => {

    describe("Fingerprint each commit with the version in package-lock.json", () => {
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
        });

        it("for projects which are not Node projects, fingerprints: automation-client-version=NONE",
            done => {
                const afterSha = randomSha();
                projectsInTheWorld[afterSha] = nonNodeProject(); // put this in the fake world
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
                        assert.equal(myFingerprint.sha, NotAnAutomationClient);
                    })
                    .then(() => done(), done);
            })
    });

    describe("A command reveals which repos are clients", () => {
        it("responds with a slack message listing all clients and their versions", done => {
            // todo: link to what this looks like in the Slack message play page

            const context = fakeContext();
            commandInvoked("list automation clients", context)
                .then(result => {
                    assert(context.responses.length === 1);
                    const response = context.responses[0];
                    assert.deepEqual(responseMessage, response, stringify(response))
                })
                .then(() => done(), done)
        })
    })

});


const pretendRepo: RepoRef = { owner: "satellite-of-love", repo: "tuvalu" };
const PretendRepoDescription = "satellite-of-love/tuvalu";
const PretendRepoLink = "https://github.com/satellite-of-love/tuvalu";

const responseMessage = {
    text: `I found 1 automation client.`,
    attachments: [{
        fallback: "an automation client",
        text: `<${PretendRepoLink}|${PretendRepoDescription}> is on version 0.2.3`,
    }],
};

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

function commandInvoked(intent: string, context: HandlerContext = fakeContext()): Promise<any> {
    const handlerThatWouldFire = listAutomationClientsCommand();
    return handlerThatWouldFire.handle(context, {})
}


function randomSha() {
    return guid()
}

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

function nonNodeProject() {
    const project = InMemoryProject.from(pretendRepo,
        { path: "README.md", content: "I am not a Node project" });
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