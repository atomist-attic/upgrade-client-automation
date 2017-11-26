import { HandlerContext, logger } from "@atomist/automation-client";
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";

export function populateChangelog(nextVersion: string, releaseDate: string): SimpleProjectEditor {
    return (p: Project, ctx: HandlerContext) =>
        p.findFile("CHANGELOG.md")
            .then(f => f.getContent()
                .then(content => f.setContent(modifyChangelogContent(nextVersion, releaseDate, content))))
            .then(() => p);
}

export function modifyChangelogContent(nextVersion: string, releaseDate: string, oldContent: string): string {
    const unreleasedLineRegex = /^\[Unreleased]: .*compare\/(.*)\.\.\.HEAD/m;
    const unreleasedLineMatch = unreleasedLineRegex.exec(oldContent);
    if (!unreleasedLineMatch) {
        logger.info("Couldn't update changelog: did not find a line matching %s", unreleasedLineRegex);
        return oldContent;
    }
    const oldVersion = unreleasedLineMatch[1];

    return oldContent
        .replace(unreleasedLineRegex, `$&

## [${nextVersion}][] - ${releaseDate}

[${nextVersion}]: https://github.com/atomist/automation-client-ts/compare/${oldVersion}...${nextVersion}`)
        .replace(new RegExp(`${oldVersion}\.\.\.HEAD`), `${nextVersion}...HEAD`);
}
