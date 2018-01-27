import { HandlerContext, logger } from "@atomist/automation-client";
import { ProjectEditor, successfulEdit, } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";

export function populateChangelog(nextVersion: string, releaseDate: string, commitSummaries: string[]): ProjectEditor {
    return (p: Project, ctx: HandlerContext) =>
        p.findFile("CHANGELOG.md")
            .then(f => f.getContent()
                .then(content => f.setContent(
                    modifyChangelogContent(nextVersion, releaseDate, commitSummaries, content))))
            .then(() => successfulEdit(p, true));
}

const BoringCommitSummaries = [/^lint$/, /^Automatic de-linting/, /[mM]erge pull request/];

function looksNontrivial(commitSummary: string): boolean {
    return !BoringCommitSummaries.some(r => !!commitSummary.match(r));
}

function looksLikeFix(commitSummary: string): boolean {
    return !!commitSummary.match(/fix/i);
}

function looksLikeAddition(commitSummary: string): boolean {
    // we like "added" or "addition" but not "padded"
    return !!(commitSummary.match(/^add/i) || commitSummary.match(/\Wadd/));
}

function listify(items: string[]): string {
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
    const addedCommits = interestingCommits.filter(looksLikeAddition);
    const changedCommits = interestingCommits
        .filter(s => !fixedCommits.includes(s))
        .filter(s => !addedCommits.includes(s));

    return oldContent
        .replace(unreleasedLineRegex, `$&

## [${nextVersion}][] - ${releaseDate}

[${nextVersion}]: https://github.com/atomist/automation-client-ts/compare/${oldVersion}...${nextVersion}

### Added

${listify(addedCommits)}

### Changed

${listify(changedCommits)}

### Fixed

${listify(fixedCommits)}`)
        .replace(new RegExp(`${oldVersion}\.\.\.HEAD`), `${nextVersion}...HEAD`);
}

export function getLastReleasedVersionFromChangelog(project: Project): Promise<string> {
    const unreleasedLineRegex = /^\[Unreleased]: .*compare\/(.*)\.\.\.HEAD/m;

    return project.findFile("CHANGELOG.md").then(f => f.getContent()).then(content => {
        const unreleasedLineMatch = unreleasedLineRegex.exec(content);
        if (!unreleasedLineMatch) {
            throw new Error("Couldn't determine prior version");
        }
        return unreleasedLineMatch[1];
    });
}
