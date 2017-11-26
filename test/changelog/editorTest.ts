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

[0.3.6]: https://github.com/atomist/automation-client-ts/compare/0.3.5...0.3.6

### Added

-   add a happy method

### Changed

-   bunch of blah blah

### Fixed

-   fixes #23
-   fix this broken thing

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
const GitLog = ["bunch of blah blah", "more blah", "lint", "fixes #23", "fix this broken thing", "add a happy method"];

describe("putting stuff in the changelog", () => {

    function startingPoint() {
        return InMemoryProject.of({ path: "CHANGELOG.md", content: SampleChangeLog });
    }

    it("updates it just right", done => {
        const result = populateChangelog(NextVersion, ReleaseDate, GitLog)(startingPoint(), undefined);

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
        return modifyChangelogContent(NextVersion, ReleaseDate, GitLog, SampleChangeLog);
    }

    it("updates the 'unreleased' section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("[Unreleased]: https://github.com/atomist/automation-client-ts/compare/0.3.6...HEAD"));
    });

    it("Adds a section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("\n## [0.3.6][] - 2017-12-31\n"));
    });

    it("includes a comparison link from old version to next", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("\n[0.3.6]: https://github.com/atomist/automation-client-ts/compare/0.3.5...0.3.6\n"));
    });

    it("puts the git log into 'changed' section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("\n### Changed\n\n-   bunch of blah blah\n-   more blah\n"));
    });

    it("excludes 'lint' commits", () => {
        const updatedFile = modifySample();
        assert(-1 === updatedFile.indexOf("-   lint\n"));
    });

    it("puts 'fix' commits in a Fixed section", () => {
        const updatedFile = modifySample();
        assert(0 < updatedFile.indexOf("\n### Fixed\n\n-   fixes #23\n"));
    });
});
