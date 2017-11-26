import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { modifyChangelogContent, populateChangelog } from "../../src/dependencyVersion/editor";

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

[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.6...HEAD

## [0.3.6][] - 2017-12-31

## [0.3.5][] - 2017-11-22

[0.3.5]: https://github.com/atomist/automation-client-ts/compare/0.3.4...0.3.5

### Changed

-   Moved \`@types/continuation-local-storage\` to dependencies since it
    has exported types
-   Added more types to default exports in index.ts

## [0.3.4][] - 2017-11-22

[0.3.4]: https://github.com/atomist/automation-client-ts/compare/0.3.3...0.3.4
`;


const NextVersion = "0.3.6";
const ReleaseDate = "2017-12-31";

describe("putting stuff in the changelog", () => {

    function startingPoint() {
        return InMemoryProject.of({ path: "CHANGELOG.md", content: SampleChangeLog });
    }

    it("updates it just right", done => {
        const result = populateChangelog(NextVersion, ReleaseDate)(startingPoint(), undefined);

        result.then(p => p.findFile("CHANGELOG.md"))
            .then(f => f.getContent())
            .then(updatedFile => {
                assert(updatedFile === UpdatedChangeLog, updatedFile);
            })
            .then(() => done(), done);
    });

});

describe("manipulating the file contents", () => {

    function modifySample() {
        return modifyChangelogContent(NextVersion, ReleaseDate, SampleChangeLog);
    }

    it("updates the 'unreleased' section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.6...HEAD"));
    });

    it("Adds a section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("\n## [0.3.6][] - 2017-12-31\n"));
    });
})
