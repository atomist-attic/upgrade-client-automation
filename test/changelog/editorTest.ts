import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { changelogGrammar, populateChangelog } from "../../src/dependencyVersion/editor";

const SampleChangeLog = `# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased][]

[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.5...HEAD

## [0.3.5][] - 2017-11-22

[0.3.5]: https://github.com/atomist/automation-client-ts/compare/0.3.4...0.3.5

### Changed

-   Moved \`@types/continuation-local-storage\` to dependencies since it
    has exported types
-   Added more types to default exports in index.ts

## [0.3.4][] - 2017-11-22

[0.3.4]: https://github.com/atomist/automation-client-ts/compare/0.3.3...0.3.4
`;

const UpdatedChangeLog = `# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased][]

[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.5...HEAD

## [0.3.5][] - 2017-11-22

[0.3.5]: https://github.com/atomist/automation-client-ts/compare/0.3.4...0.3.5

### Changed

-   Moved \`@types/continuation-local-storage\` to dependencies since it
    has exported types
-   Added more types to default exports in index.ts

## [0.3.4][] - 2017-11-22

[0.3.4]: https://github.com/atomist/automation-client-ts/compare/0.3.3...0.3.4
`;

describe("putting stuff in the changelog", () => {

    function startingPoint() {
        return InMemoryProject.of({ path: "CHANGELOG.md", content: SampleChangeLog });
    }

    const NextVersion = "0.3.6";

    it("updates the 'unreleased' section", done => {
        const result = populateChangelog(NextVersion)(startingPoint(), undefined);

        result.then(p => p.findFile("CHANGELOG.md"))
            .then(f => f.getContent())
            .then(updatedFile => {
                assert(0 < updatedFile.indexOf("[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.6...HEAD"));
            })
            .then(() => done(), done);
    });

});

describe("the changelog grammar", () => {

    it("finds the old version", () => {
        const match = changelogGrammar.firstMatch(SampleChangeLog);
        assert(match.lastReleasedVersion === "0.3.5");

    });

});
