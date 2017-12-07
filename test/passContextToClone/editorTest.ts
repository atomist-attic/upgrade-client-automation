/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { AddParameter, passContextToFunction } from "../../src/passContextToClone/editor";
import * as stringify from "json-stringify-safe";

import * as appRoot from "app-root-path";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import { Project } from "@atomist/automation-client/project/Project";
import PassDummyInTestsRequirement = AddParameter.PassDummyInTestsRequirement;
import AddParameterRequirement = AddParameter.AddParameterRequirement;
import implement = AddParameter.implement;
import Requirement = AddParameter.Requirement;
import sameRequirement = AddParameter.sameRequirement;
import findConsequences = AddParameter.findConsequences;
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import isPassArgumentRequirement = AddParameter.isPassArgumentRequirement;
import PassArgumentRequirement = AddParameter.PassArgumentRequirement;
import guessPathExpression = AddParameter.guessPathExpression;
import functionDeclarationFromCallIdentifier = AddParameter.functionDeclarationFromCallIdentifier;


function addParameterRequirement(fci: AddParameter.FunctionCallIdentifier): AddParameterRequirement {
    return {
        "kind": "Add Parameter",
        "functionWithAdditionalParameter": fci,
        functionDeclaration: functionDeclarationFromCallIdentifier(fci),
        "parameterType": { kind: "library", name: "HandlerContext", location: "@atomist/automation-client" },
        "parameterName": "context",
        populateInTests: {
            dummyValue: "{}",
        },
        scope: { kind: "PublicFunctionScope" },
    };
}

function getAllMatches(r: RegExp, s: string): string[] {
    if (r.flags.indexOf("g") < 0) {
        throw new Error("This is useless without a global regexp")
    }
    const output = [];
    let m;
    while (m = r.exec(s)) {
        output.push(m[0])
    }
    return output;
}

describe("editor to pass the context into the cloned method", () => {
    it("sends a dummy context into tests, with just enough populated", done => {

        const OldTestCode = `
    const getAClone = (repoName: string = RepoName) => {
        const repositoryThatExists = new GitHubRepoRef(Owner, repoName);
        return GitCommandGitProject.cloned(Creds, repositoryThatExists);
    };

    it("does another thing", () => {
       GitCommandGitProject.cloned({ token: "yeah" }, whatever, more, things)
    });
`;

        const input = InMemoryProject.of({ path: "test/something.ts", content: OldTestCode });
        passContextToFunction({
            containingClass: "GitCommandGitProject",
            name: "cloned", filePath: "src/project/git/GitCommandGitProject.ts",
        })(input)
            .then(report => input.findFile("test/something.ts"))
            .then(f => f.getContent())
            .then(newTestCode => {
                const wanted = /cloned\({} as HandlerContext,/g;
                const m = getAllMatches(wanted, newTestCode);
                assert.equal(m.length, 2, newTestCode);
            }).then(() => done(), done);
    });

    it("detects context in the calling function", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");
        const mutableProject = InMemoryProject.of(
            thisProject.findFileSync("src/CodeThatUsesIt.ts"),
            thisProject.findFileSync("src/AdditionalFileThatUsesStuff.ts"));

        const resultProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/after");

        const functionWeWant = "giveMeYourContext";

        passContextToFunction({
            namespace: "InHere",
            name: functionWeWant,
            filePath: "src/CodeThatUsesIt.ts",
        })(mutableProject)
            .then(report => {
                const modified = mutableProject.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();
                const expected = resultProject.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();

                console.log(modified);
                assert(modified.includes("import { HandlerContext"), "needs the import");
                assert(modified.includes("andEvenMoreStuff(context: HandlerContext"), "adds parameter");
                assert(modified.includes("usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(context"),
                    "passes argument");
                return report;
            })
            .then(report => {
                const modified = mutableProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();
                const expected = resultProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();

                console.log(modified);
                assert.equal(report.addParameterReport.unimplemented.length, 0,
                    stringify(report, null, 2));
                assert.equal(report.addParameterReport.implemented.length, 12,
                    stringify(report, null, 2));
                assert.equal(modified, expected, modified);
            }).then(() => done(), done);
    });

});

describe("detection of consequences", () => {

    it("does not change anything in test/ when Add Parameter is called");

    it("when Add Parameter to a private function, don't pass dummy in tests");

    it("when a function with a new parameter is not exported, calls to the same-name function in another file are not affected", done => {

        const fileToNotChange = "src/notFunciton.ts";
        const fileToChange = "src/funciton.ts";
        const input = InMemoryProject.of({
                path: fileToNotChange,
                content: `
        export function thinger() {
            return privateFunciton("and stuff");
        }
        
        function privateFunciton(s: string) {
           console.log("this is mine, it is not changing");
        }\n`,
            },
            {
                path: fileToChange,
                content: `
        export function iShouldChange() {
            return privateFunciton("yarrr");
        }
        
         function privateFunciton(s: string) {
           console.log("give me your context! I need it!");
        }
`,
            },
        );

        const original: Requirement = {
            ...addParameterRequirement({
                name: "privateFunciton",
                filePath: "src/DoesntMatter.ts",
            }),
            scope: { kind: "PrivateFunctionScope", glob: fileToChange, pxe: "/*" },
        };

        findConsequences(input, [original])
            .then(consequences => {
                assert(consequences.some(c =>
                    c.kind === "Add Parameter"
                    && c.functionWithAdditionalParameter.name === "iShouldChange"
                    && c.scope.kind === "PublicFunctionScope",
                ));
                assert(!consequences.some(c => c.functionWithAdditionalParameter.filePath === fileToNotChange),
                    stringify(consequences, null, 2));
                assert(!consequences.some(c => isPassArgumentRequirement(c) && c.enclosingFunction.filePath === fileToNotChange));
            })
            .then(() => done(), done);
    });

    it("detects an exported function and calls it public", done => {
        const fileOfInterest = "src/Classy.ts";
        const input = InMemoryProject.of({
            path: fileOfInterest, content: `
        export function thinger() {
            return giveMeYourContext("and stuff");
        }\n`,
        });

        const original: Requirement = addParameterRequirement({
            name: "giveMeYourContext",
            filePath: "src/DoesntMatter.ts",
        });

        printStructureOfFile(input, fileOfInterest)
            .then(() => findConsequences(input, [original]))
            .then(consequences => {
                assert(consequences.some(c => {
                    return c.kind === "Add Parameter" && c.functionWithAdditionalParameter.name === "thinger"
                        && c.scope.kind === "PublicFunctionScope";
                }))
            })
            .then(() => done(), done);
    });


    it("detects a not-exported function and calls it private", done => {
        const fileOfInterest = "src/Classy.ts";
        const input = InMemoryProject.of({
            path: fileOfInterest, content: `
        function thinger() {
            return giveMeYourContext("and stuff");
        }\n`,
        });

        const original: Requirement =
            addParameterRequirement({
                name: "giveMeYourContext",
                filePath: "src/DoesntMatter.ts",
            });

        printStructureOfFile(input, fileOfInterest)
            .then(() => findConsequences(input, [original]))
            .then(consequences => {
                const consequenceOfInterest: AddParameterRequirement = consequences.find(c =>
                    c.kind === "Add Parameter" && c.functionWithAdditionalParameter.name === "thinger") as AddParameterRequirement;
                assert(consequenceOfInterest);
                assert.equal(consequenceOfInterest.scope.kind, "PrivateFunctionScope");
            })
            .then(() => done(), done);
    });

    it("finds calls inside a class method", done => {
        const fileOfInterest = "src/Classy.ts";
        const input = InMemoryProject.of({
            path: fileOfInterest, content: `
        class Classy {
            protected thinger() {
                return giveMeYourContext("and stuff");
            }
        }\n`,
        });

        const original: Requirement = addParameterRequirement({
            name: "giveMeYourContext",
            filePath: "src/DoesntMatter.ts",
        });

        printStructureOfFile(input, fileOfInterest)
            .then(() => findConsequences(input, [original]))
            .then(consequences => {
                assert(consequences.some(c => {
                    return c.kind === "Pass Argument" && c.enclosingFunction.pxe.includes("Classy");
                }))
            })
            .then(() => done(), done);
    });
    /*
        protected repoLoader(params: P): RepoLoader {
        return defaultRepoLoader({token: params.target.githubToken});
    }
     */

    it("returns the original requirement", done => {
        const input = copyOfBefore();

        const original: Requirement = addParameterRequirement({
            name: "exportedDoesNotYetHaveContext",
            filePath: "src/CodeThatUsesIt.ts",
        },);

        AddParameter.findConsequences(input, [original])
            .then(consequences => {
                assert(consequences.some(o => sameRequirement(o, original)))
            }).then(() => done(), done);
    });

    it("can find calls to functions that aren't qualified names", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        AddParameter.findConsequences(thisProject,
            [addParameterRequirement({
                name: "exportedDoesNotYetHaveContext",
                filePath: "src/CodeThatUsesIt.ts",
            })])
            .then(consequences => {
                assert.equal(consequences.length, 8, stringify(consequences))
            })
            .then(() => done(), done);
    });

    it("looks at many levels, in multiple files", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        AddParameter.findConsequences(thisProject,
            [addParameterRequirement({
                namespace: "InHere",
                name: "giveMeYourContext",
                filePath: "src/CodeThatUsesIt.ts",
            })]).then(consequences => {

            const addParameterAtHigherLevel = consequences.find(c =>
                AddParameter.isAddParameterRequirement(c) &&
                c.functionWithAdditionalParameter.name === "usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext");

            assert(addParameterAtHigherLevel, stringify(consequences.filter(AddParameter.isAddParameterRequirement), null, 2));

            const addParameterAtEvenHigherLevel = consequences.find(c =>
                AddParameter.isAddParameterRequirement(c) &&
                c.functionWithAdditionalParameter.name === "andEvenMoreStuff");

            assert(addParameterAtEvenHigherLevel);

            assert.equal(consequences.length,
                17, // plausible
                stringify(consequences, null, 2))
        })
            .then(() => done(), done);
    }).timeout(20000);


    it("helps me out", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        const innerExpression = `/Identifier[@value='usesAFunctionThatDoesNotHaveContext']`;

        findMatches(thisProject, TypeScriptES6FileParser, "src/CodeThatUsesIt.ts",
            `/SourceFile`)
            .then(matches => {
                    matches.forEach(m => {
                            console.log(printMatch(m).join("\n"));


                            const source = matches[0];
                            const existingImport = source.evaluateExpression(
                                `//ImportDeclaration//Identifier[@value='HandlerContext']`);
                            console.log("wtf does this return: " + existingImport.length)
                        },
                    )
                },
            ).then(() => done(), done);

    })
})
;


describe("pass argument", () => {

    it("finds calls inside methods", done => {
        const fileOfInterest = "src/project/diff/DifferenceEngine.ts";
        const input = InMemoryProject.of(
            {
                path: fileOfInterest, content: `export class DifferenceEngine {

    private cloneRepo(githubIssueAuth: GithubIssueAuth, sha: string): Promise<GitProject> {
        return GitCommandGitProject.cloned(
            {token: githubIssueAuth.githubToken},
                new GitHubRepoRef(githubIssueAuth.owner, githubIssueAuth.repo, githubIssueAuth.sha));
    }
}
             `,
            });

        const instruction: PassArgumentRequirement = {
            "kind": "Pass Argument",
            "enclosingFunction": {
                "pxe": "//ClassDeclaration[/Identifier[@value='DifferenceEngine']]//MethodDeclaration[/Identifier[@value='cloneRepo']]",
                "filePath": "src/project/diff/DifferenceEngine.ts",
            },
            "functionWithAdditionalParameter": {
                "containingClass": "GitCommandGitProject",
                "name": "cloned",
                "filePath": "src/project/git/GitCommandGitProject.ts",
            },
            "argumentValue": "context",
        };

        printStructureOfFile(input, "src/project/diff/DifferenceEngine.ts").then(() =>
            AddParameter.implement(input, instruction).then(() => input.flush())
                .then(() => {
                    const after = input.findFileSync("src/project/diff/DifferenceEngine.ts").getContentSync();
                    assert(after.includes("cloned(context, "), after)
                }))
            .then(() => done(), done)
    });

    it("print path of match", done => {
        const fileOfInterest = "src/project/diff/DifferenceEngine.ts";
        const input = InMemoryProject.of(
            {
                path: fileOfInterest, content: `export class DifferenceEngine {

    private cloneRepo(githubIssueAuth: GithubIssueAuth, sha: string): Promise<GitProject> {
        return GitCommandGitProject.cloned(
            {token: githubIssueAuth.githubToken},
                new GitHubRepoRef(githubIssueAuth.owner, githubIssueAuth.repo, githubIssueAuth.sha));
    }
}
             `,
            });

        pathOfMatch(input, fileOfInterest).then(paths => {
                const expectedPath = "//ClassDeclaration[/Identifier[@value='DifferenceEngine']]//MethodDeclaration[/Identifier[@value='cloneRepo']]";
                assert.deepEqual([expectedPath], paths);
                return findMatches(input, TypeScriptES6FileParser, fileOfInterest,
                    paths[0]).then(matches => {
                    assert.equal(identifier(matches[0]), "cloneRepo");
                })
            },
        )
            .then(() => done(), done)
    })
});

function identifier(parent: TreeNode): string {
    return childrenNamed(parent, "Identifier")[0].$value
}

function childrenNamed(parent: TreeNode, name: string) {
    return parent.$children.filter(child => child.$name === name);
}

function pathOfMatch(project: Project, path: string): Promise<string[]> {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile//ClassDeclaration//MethodDeclaration`)
        .then(matches => {
            return matches.map(m => {
                return guessPathExpression(m);
            })
        });
}

describe("populating dummy in test", () => {

    it("finds tests in test-api");

    it("adds an additional import", done => {
        const fileOfInterest = "test/Something.ts";
        const input = InMemoryProject.of(
            {
                path: fileOfInterest, content: `import \"mocha\";\n
             
             myFunction();
             `,
            });

        const instruction: PassDummyInTestsRequirement = {
            functionWithAdditionalParameter: { name: "myFunction", filePath: "doesntmatter" },
            kind: "Pass Dummy In Tests",
            dummyValue: "{} as HandlerContext",
            additionalImport: {
                kind: "library", name: "HandlerContext",
                location: "@atomist/automation-client",
            },
        }

        AddParameter.implement(input, instruction).then(() => input.flush())
            .then(() => {
                const after = input.findFileSync(fileOfInterest).getContentSync();
                assert(after.includes("import { HandlerContext } "), after)
            })
            .then(() => done(), done)
    })
});


function printStructureOfFile(project: Project, path: string) {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile`)
        .then(matches => {
            matches.forEach(m => {
                console.log(printMatch(m).join("\n"));
            })
        });
}

function copyOfBefore() {
    const thisProject = new NodeFsLocalProject("automation-client",
        appRoot.path + "/test/passContextToClone/resources/before");
    return InMemoryProject.of(
        thisProject.findFileSync("src/CodeThatUsesIt.ts"),
        thisProject.findFileSync("src/AdditionalFileThatUsesStuff.ts"));
}

describe("Adding a parameter", () => {

    it("adds it to the real one", done => {
        const fileOfInterest = "src/project/git/GitCommandGitProject.ts";
        const realProject = new NodeFsLocalProject("automation-client",
            "/Users/jessitron/code/atomist/automation-client-ts");
        const input = InMemoryProject.of(
            realProject.findFileSync(fileOfInterest));

        const addParameterInstruction: AddParameterRequirement = {
            ...addParameterRequirement({
                "name": "GitCommandGitProject.cloned",
                "filePath": "src/project/git/GitCommandGitProject.ts",
            }),
            "parameterType": {
                "kind": "local",
                "name": "HandlerContext",
                "localPath": "src/HandlerContext",
            },
            "populateInTests": {
                "dummyValue": "{} as HandlerContext",
                "additionalImport": {
                    "kind": "local",
                    "name": "HandlerContext",
                    "localPath": "src/HandlerContext",
                },
            },
            scope: { kind: "PublicFunctionScope" },
        };

        implement(input, addParameterInstruction).then(report => {
            console.log(stringify(report, null, 2));
            //return printStructureOfFile(input, fileOfInterest);
        }).then(() => input.flush())
            .then(() => {
                const after = input.findFileSync(fileOfInterest).getContentSync();
                assert(after.includes("public static cloned(context: HandlerContext"), after);
                assert(after.includes(
                    `import { HandlerContext } from "../../HandlerContext"`),
                    after.split("\n")[0])
            }).then(() => done(), done)

    });

    it("finds the function inside a class", done => {
        const fileOfInterest = "src/Classy.ts";
        const input = InMemoryProject.of({
            path: fileOfInterest, content:
                `class Classy {
        public static giveMeYourContext(stuff: string) { }
        }
        `,
        });

        const addParameterInstruction: AddParameterRequirement = addParameterRequirement(
            { containingClass: "Classy", name: "giveMeYourContext", filePath: fileOfInterest })
        implement(input, addParameterInstruction).then(report => {
            console.log(stringify(report, null, 2));
            return printStructureOfFile(input, fileOfInterest);
        }).then(() => input.flush())
            .then(() => {
                const after = input.findFileSync(fileOfInterest).getContentSync();
                assert(after.includes("public static giveMeYourContext(context: HandlerContext, stuff: string)"), after)
            }).then(() => done(), done)

    });

    it("finds the function inside a namespace", done => {
        const fileOfInterest = "src/Spacey.ts";
        const input = InMemoryProject.of({
            path: fileOfInterest, content:
                `namespace Spacey {
        export function giveMeYourContext(stuff: string) { }
        }
`,
        });

        const addParameterInstruction: AddParameterRequirement = addParameterRequirement({
            namespace: "Spacey",
            name: "giveMeYourContext",
            filePath: fileOfInterest,
        });

        implement(input, addParameterInstruction).then(report => {
            console.log(stringify(report, null, 2));
            return printStructureOfFile(input, fileOfInterest);
        }).then(() => input.flush())
            .then(() => {
                const after = input.findFileSync(fileOfInterest).getContentSync();
                assert(after.includes("export function giveMeYourContext(context: HandlerContext, stuff: string)"), after)
            }).then(() => done(), done)

    });

    it("Adds the right type", done => {
        const input = copyOfBefore();
        AddParameter.implement(input, addParameterRequirement({
            name: "andEvenMoreStuff", filePath: "src/AdditionalFileThatUsesStuff.ts",
        },)).then(changed => input.flush().then(() => changed))
            .then(report => {
                const after = input.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();
                assert(after.includes(
                    `andEvenMoreStuff(context: HandlerContext, `), after)
            }).then(() => done(), done)
    });

    it("Adds an import file too", done => {
        const input = copyOfBefore();
        AddParameter.implement(input, {
            ...addParameterRequirement({
                name: "andEvenMoreStuff", filePath: "src/AdditionalFileThatUsesStuff.ts",
            },),
            parameterType: { kind: "library", name: "HandlerContext", location: "@atomist/automation-client" },
        }).then(changed => input.flush().then(() => changed))
            .then(report => {
                const after = input.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();
                assert(after.includes(
                    `import { HandlerContext } from "@atomist/automation-client"`), after)
            }).then(() => done(), done)
    });


});

function printMatch(m: TreeNode): string[] {
    let me = m.$name + "/";
    if (!m.$children) {
        me = m.$name + " = " + m.$value;
    }
    const myBabies = _.flatMap(m.$children, ch => printMatch(ch).map(o => " " + o));
    return [me].concat(myBabies);
}

// wishlist: a replacer that would let me print MatchResults, without printing sourceFile every time

describe("actually run it", () => {

    // question: how can I turn off debug output?

    it("just run it", done => {
        const realProject = GitCommandGitProject.fromProject(new NodeFsLocalProject("automation-client",
            "/Users/jessitron/code/atomist/automation-client-ts"), { token: "poo" });

        function commitDangit(r1: Requirement, report: AddParameter.Report) {
            if (report.implemented.length === 0) {
                console.log("Skipping commit for " + stringify(r1));
                return Promise.resolve();
            }
            return realProject.commit(stringify(r1)).then(() => Promise.resolve())
        }

        passContextToFunction({
            name: "GitCommandGitProject.cloned",
            filePath: "src/project/git/GitCommandGitProject.ts",
        }, commitDangit)(realProject)
            .then(report => {
                console.log("implemented: " + stringify(report.addParameterReport.implemented, null, 1))
                console.log("UNIMPLEMENTED: " + stringify(report.addParameterReport.unimplemented, null, 2))
            })
            .then(() => done(), done)
    }).timeout(1000000);
});
