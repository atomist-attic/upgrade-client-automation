import "mocha";
import * as assert from "power-assert";

import { observePushedFingerprints } from "../fakePushFingerprints";
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
import { modulesInTheWorld } from "../fakeNpm";
import { HandlerContext } from "@atomist/automation-client";
import { listAutomationClientsCommand } from "../../src/dependencyVersion/ListAutomationClients";
import { CommitSpecs, OneCommitInTheWorld, ProjectInTheWorld } from "../jessFakesTheWorld";
import * as slack from "@atomist/slack-messages/SlackMessages";


describe("Observe: which automation clients are on each version", () => {

    describe("Fingerprint each commit with the version in package-lock.json", () => {
        it("on push, fingerprint is sent: automation-client-version=0.2.3", (done) => {
            // There exists a project with automation client version 0.2.3
            const projectThatUsesAutomationClient = automationClientProject("0.2.3");
            // and we make a push to it
            populateTheWorld(projectThatUsesAutomationClient);
            const pushEvent = pushForFingerprinting(projectThatUsesAutomationClient);
            eventArrives(pushEvent)
                .then(handlerResult => {
                    assert(handlerResult.code === 0, stringify(handlerResult));
                    // a fingerprint has been pushed
                    const pushedFingerprint = observePushedFingerprints(projectThatUsesAutomationClient);
                    assert(pushedFingerprint, "Nothing pushed for " + projectThatUsesAutomationClient.latestSha);
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
                const pitw = nonNodeProject(); // put this in the fake world
                // and we make a push to it
                populateTheWorld(pitw);
                const pushEvent = pushForFingerprinting(pitw);
                eventArrives(pushEvent)
                    .then(handlerResult => {
                        assert(handlerResult.code === 0, stringify(handlerResult));
                        // a fingerprint has been pushed
                        const pushedFingerprint = observePushedFingerprints(pitw);
                        assert(pushedFingerprint, "Nothing pushed for " + pitw.latestSha);
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
            const graph = populateTheWorld(
                automationClientProject("0.2.3",
                    {
                        "some-better-branch": { automationClientVersion: "0.2.4", running: true },
                        "a-same-branch": "0.2.3",
                        "custom-branch": "https://r.atomist.com/sakfjhqwekhrquef",
                        "gh-pages": null,
                    }),
                nonNodeProject());

            // really this graphql result should be part of populating the world
            const context = fakeContext(graph);
            commandInvoked("list automation clients", context)
                .then(result => {
                    assert(context.responses.length === 1);
                    const response = context.responses[0];
                    // todo: link to what this looks like in the Slack message play page
                    assert.deepEqual(response, responseMessage)
                })
                .then(() => done(), done)
        });

        it("colors green if the default branch is on the latest version", done => {
            const graph = populateTheWorld(
                automationClientProject("0.6.5",
                    {
                        "an-old-branch": "0.2.3",
                        "gh-pages": null,
                    }),
                nonNodeProject());

            // really this graphql result should be part of populating the world
            const context = fakeContext(graph);
            commandInvoked("list automation clients", context)
                .then(() => {
                    const response = context.responses[0] as slack.SlackMessage;
                    assert.equal("#609930", response.attachments[0].color)
                })
                .then(() => done(), done)
        });

        it("does not send an additional fingerprint if one exists", done => {
            const p = automationClientProject({
                automationClientVersion: "0.6.5",
                running: false, fingerprinted: true,
            });
            const graph = populateTheWorld(p);

            // really this graphql result should be part of populating the world
            const context = fakeContext(graph);
            commandInvoked("list automation clients", context)
                .then(() => {
                    // a fingerprint has been pushed
                    const pushedFingerprint = observePushedFingerprints(p);
                    assert(!pushedFingerprint);
                })
                .then(() => done(), done)
        })
    })

});


const pretendRepo: RepoRef = { owner: "satellite-of-love", repo: "lifecycle-automation" };
const PretendRepoDescription = "satellite-of-love/lifecycle-automation";
const PretendRepoLink = "https://github.com/satellite-of-love/lifecycle-automation";

const responseMessage = {
    text: `Found 1 automation client
The latest version of @atomist/automation-client is 0.6.5`,
    attachments: [{
        fallback: "an automation client",
        title: PretendRepoDescription,
        title_link: PretendRepoLink,
        color: "#bb2030",
        text: `:running: <https://github.com/satellite-of-love/lifecycle-automation/tree/some-better-branch|some-better-branch> 0.2.4
*master* 0.2.3
<https://github.com/satellite-of-love/lifecycle-automation/tree/a-same-branch|a-same-branch> 0.2.3
<https://github.com/satellite-of-love/lifecycle-automation/tree/custom-branch|custom-branch> (custom)`,
    }],
};

const LatestAutomationClient = "0.6.5";

function populateTheWorld(...projects: ProjectInTheWorld[]) {
    modulesInTheWorld["@atomist/automation-client"] = LatestAutomationClient;
    projects.forEach(pitw => {
        for (let sha in pitw.commits) {
            projectsInTheWorld[sha] = InMemoryProject.from(pitw.repoRef,
                ...pitw.commits[sha].files);
        }
    });

    return {
        "graphql/list": { Repo: projects.map(pitw => pitw.listEntry) },
    }
}

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
    return handlerThatWouldFire.handle(context, { githubToken: "I AM A FAKE TOKEN" })
}


function randomSha() {
    return guid()
}

function pushForFingerprinting(pitw: ProjectInTheWorld): graphql.PushForFingerprinting.Query {
    const push = {
        repo: { owner: pitw.repoRef.owner, name: pitw.repoRef.repo },
        after: { sha: pitw.latestSha },
    };
    return { Push: [push] }
}

type DefaultedBranchInfo = BranchInfo | string | null

type BranchInfo = {
    automationClientVersion: string,
    running?: boolean, fingerprinted?: boolean
}

function isBranchInfo(dbi: DefaultedBranchInfo): dbi is BranchInfo {
    return dbi && (typeof(dbi) !== "string");
}

function applyDefault(bi: DefaultedBranchInfo): BranchInfo {
    if (isBranchInfo(bi)) {
        return bi;
    }
    return {
        automationClientVersion: bi,
        running: false,
        fingerprinted: false,
    }
}

function automationClientProject(defaultBranchAutomationClientVersion: DefaultedBranchInfo,
                                 otherBranches: { [key: string]: DefaultedBranchInfo} = {}): ProjectInTheWorld {
    const branchInfo = applyDefault(defaultBranchAutomationClientVersion);
    const sha = randomSha();

    const branches: graphql.ListAutomationClients.Branches[] =
        [branchFor("master", sha, branchInfo)];
    const commits: CommitSpecs = {};
    commits[sha] = commitFor(branchInfo.automationClientVersion);

    for (let branchName in otherBranches) {
        const anotherSha = randomSha();
        const anotherBranchInfo = applyDefault(otherBranches[branchName]);
        branches.push(branchFor(branchName, anotherSha, anotherBranchInfo));
        commits[anotherSha] = commitFor(anotherBranchInfo.automationClientVersion);
    }

    const r: graphql.ListAutomationClients.Repo = {
        defaultBranch: "master",
        name: pretendRepo.repo,
        owner: pretendRepo.owner,
        org: {},
        branches,
    };

    return {
        repoRef: pretendRepo,
        commits,
        latestSha: sha,
        listEntry: r,
    };
}

function branchFor(name: string, sha: string,
                   acv: BranchInfo): graphql.ListAutomationClients.Branches {
    return {
        name,
        pullRequests: [],
        commit: {
            sha,
            message: "I don't know",
            fingerprints: acv.fingerprinted ? [{ data: undefined,
                sha: acv.automationClientVersion,
                name: AutomationClientVersionFingerprintName }] : [],
            apps: acv.running ? [{ state: "started", host: "outer space" }] : [],
        },
    };
}

function commitFor(automationClientVersion: string): OneCommitInTheWorld {
    return {
        files: [
            packageJson(automationClientVersion),
            packageLockJson(automationClientVersion)],
    }
}

const pretendNonNodeRepo: RepoRef = { owner: "satellite-of-love", repo: "spildrazil" };

function nonNodeProject(): ProjectInTheWorld {
    const sha = randomSha();
    const r: graphql.ListAutomationClients.Repo = {
        defaultBranch: "master",
        name: pretendNonNodeRepo.repo,
        owner: pretendNonNodeRepo.owner,
        org: {},
        branches: [{
            name: "master",
            pullRequests: [],
            commit: {
                sha,
                message: "I don't know",
                fingerprints: [],
                apps: [],
            },
        }],
    };
    const commits: CommitSpecs = {};
    commits[sha] = { files: [{ path: "README.md", content: "I am not a Node project" }], }
    return {
        repoRef: pretendNonNodeRepo,
        commits,
        latestSha: sha,
        listEntry: r,
    };
}

function packageJson(automationClientVersion: string): { path: "package.json", content: string } {
    const content = `{
  "name": "@satellite-of-love/tuvalu",
  "version": "0.1.2",
  "description": "Look I am an automation",
  "dependencies": {
    ${automationClientVersion ? `"@atomist/automation-client": "${automationClientVersion}",` : ""}
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
    const version = automationClientVersion || "4.4.4";
    const lib = automationClientVersion ? "@atomist/automation-client" : "something-else";
    const content = `{
  "name": "@atomist/upgrade-client-automation",
  "version": "0.1.2",
  "lockfileVersion": 1,
  "requires": true,
  "dependencies": {
    "${lib}": {
      "version": "${version}",
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