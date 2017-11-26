import { HandlerContext, logger } from "@atomist/automation-client";
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { Microgrammar } from "@atomist/microgrammar/Microgrammar";

export function populateChangelog(nextVersion: string): SimpleProjectEditor {
    return (p: Project, ctx: HandlerContext) =>
        p.findFile("CHANGELOG.md")
            .then(f => f.getContent()
                .then(content => f.setContent(modifyChangelogContent(nextVersion, content))))
            .then(() => p);
}

function modifyChangelogContent(nextVersion: string, oldContent: string): string {
    const unreleasedLineRegex = /^[Unreleased]: .*compare\/(.*)\.\.\.HEAD/m;
    const unreleasedLineMatch = unreleasedLineRegex.exec(oldContent);
    if (!unreleasedLineMatch) {
        logger.info("Couldn't update changelog: did not find a line matching %s", unreleasedLineRegex);
        return oldContent;
    }
    const oldVersion = unreleasedLineMatch[1];

    return oldContent;
}

export interface ChangelogGrammar {
    lastReleasedVersion: string;
}

export const changelogGrammar = Microgrammar.fromString<ChangelogGrammar>(`
[Unreleased] \${blah} compare \${lastReleasedVersion}...HEAD` );
