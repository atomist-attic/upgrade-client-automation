import { logger } from "@atomist/automation-client";
import { Project } from "@atomist/automation-client/project/Project";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import * as path from "path";

export namespace AddImport {

    export type ImportIdentifier = LibraryImport | LocalImport;

    export interface LibraryImport {
        kind: "library";
        name: string;
        location: string;
    }

    function isLibraryImport(i: ImportIdentifier): i is LibraryImport {
        return i.kind === "library";
    }

    export interface LocalImport {
        kind: "local";
        name: string;
        localPath: string;
    }

    function calculateRelativePath(from: string, to: string) {
        const relativePath = path.relative(from, to);
        logger.info("Relative path from %s to %s is %s", from, to, relativePath);
        return relativePath
            .replace(/^\.\.\//, "./") // go back one fewer than it thinks
            .replace(/^\.\/\.\.\//, "../");  // but ./../ looks silly
    }

    export function addImport(project: Project, path: string, what: ImportIdentifier): Promise<boolean> {
        return findMatches(project, TypeScriptES6FileParser, path, "/SourceFile")
            .then(sources => {
                const source = requireExactlyOne(sources, "didn't parse " + path);
                const existingImport = source.evaluateExpression(
                    `//ImportDeclaration//Identifier[@value='${what.name}']`);
                if (existingImport && 0 < existingImport.length) {
                    logger.debug("Import already exists: " + existingImport[0].$value);
                    // import found. Not handled: the same identifier is imported from elsewhere.
                    return false;
                }

                const location = isLibraryImport(what) ? what.location : calculateRelativePath(
                    path,
                    what.localPath);

                const locationImportMatches = source.evaluateExpression(
                    `//ImportDeclaration[//StringLiteral[@value='${location}']]`);
                if (locationImportMatches && 0 < locationImportMatches.length) {
                    const locationImport = locationImportMatches[0];
                    // not handling: *
                    const newValue = locationImport.$value.replace(
                        /{/,
                        `{ ${what.name},`);
                    locationImport.$value = newValue;
                    logger.debug("Adding to import. New value: " + newValue);
                    return true;
                }
                // No existing import to modify. Add one.
                const newStatement = `import { ${what.name} } from "${location}";\n`;

                logger.debug("adding new import statement: " + newStatement);
                source.$value = newStatement + source.$value;
                return true;
            }).catch(err => {
                logger.error("Unable to add import: %s", err);
                return false;
            });
    }

    function requireExactlyOne(m: MatchResult[], msg: string): MatchResult {
        if (!m) {
            throw new Error("match result undefined. " + msg);
        }
        if ( m.length !== 1) {
            throw new Error("Expected 1, got " + m.length + " matches. " + msg);
        }
        return m[0];
    }
}
