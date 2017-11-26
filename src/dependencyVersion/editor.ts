import { HandlerContext, logger } from "@atomist/automation-client";
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";

export function populateChangelog(nextVersion: string, releaseDate: string, commitSummaries: string[]): SimpleProjectEditor {
    return (p: Project, ctx: HandlerContext) =>
        p.findFile("CHANGELOG.md")
            .then(f => f.getContent()
                .then(content => f.setContent(
                    modifyChangelogContent(nextVersion, releaseDate, commitSummaries, content))))
            .then(() => p);
}

const BoringCommitSummaries = ["lint", "Automatic de-linting"];

function looksNontrivial(commitSummary: string): boolean {
    return !BoringCommitSummaries.includes(commitSummary);
}

function looksLikeFix(commitSummary: string): boolean {
    return !!commitSummary.match(/fix/i);
}

function listify(items: string[]):string {
    return items.map(s => "-   " + s).join("\n");
}

export function modifyChangelogContent(nextVersion: string,
                                       releaseDate: string,
                                       commitSummaries: string[],
                                       oldContent: string): string {
    const unreleasedLineRegex = /^\[Unreleased]: .*compare\/(.*)\.\.\.HEAD/m;
    const unreleasedLineMatch = unreleasedLineRegex.exec(oldContent);
    if (!unreleasedLineMatch) {
        logger.info("Couldn't update changelog: did not find a line matching %s", unreleasedLineRegex);
        return oldContent;
    }
    const oldVersion = unreleasedLineMatch[1];

    const interestingCommits = commitSummaries.filter(looksNontrivial);
    const fixedCommits = interestingCommits.filter(looksLikeFix);
    const changedCommits = interestingCommits
        .filter(s => !fixedCommits.includes(s));

    return oldContent
        .replace(unreleasedLineRegex, `$&

## [${nextVersion}][] - ${releaseDate}

[${nextVersion}]: https://github.com/atomist/automation-client-ts/compare/${oldVersion}...${nextVersion}

### Changed

${listify(changedCommits)}

### Fixed

${listify(fixedCommits)}`)
        .replace(new RegExp(`${oldVersion}\.\.\.HEAD`), `${nextVersion}...HEAD`);
}
