import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { Project } from "@atomist/automation-client/project/Project";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import { logger } from "@atomist/automation-client";
import { AddParameter } from "../AddParameter";
import AddParameterRequirement = AddParameter.AddParameterRequirement;
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";

/*
 * To run this while working:
 *
 * cd src/passContextToClone/
 * watch "ts-node jess/ModifyAddParameter.ts" jess
 *
 * and then push alt-cmd-Y in IntelliJ on AddParameter.ts to refresh it
 *
 * next:
 */

function printStructureOfFile(project: Project, path: string) {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile`)
        .then(matches => {
            if (matches.length === 0) {
                console.log("no matches found!")
            }
            matches.forEach(m => {
                console.log(printMatch(m).join("\n"));
            })
        });
}

function printMatch(m: TreeNode): string[] {
    let me = m.$name + "/";
    if (!m.$children) {
        me = m.$name + " = " + m.$value;
    }
    const myBabies = _.flatMap(m.$children, ch => printMatch(ch).map(o => " " + o));
    return [me].concat(myBabies);
}


function runInSequence(project: Project, activities: (() => Promise<void>)[]): Promise<any> {
    return activities.reduce(
        (pp: Promise<void>, callMe: () => Promise<void>) =>
            pp.then(() => callMe())
                .then(() => project.flush())
                .then(() => Promise.resolve()),
        Promise.resolve());
}

function requireExactlyOne<A>(some: A[], msg?: string): A {
    if (some.length !== 1) {
        throw new Error(msg || "I thought that there was one, nothing less or more");
    }
    return some[0];
}

function identifier(parent: TreeNode): string {
    return childrenNamed(parent, "Identifier")[0].$value
}

function childrenNamed(parent: TreeNode, name: string): TreeNode[] {
    return parent.$children.filter(child => child.$name === name);
}

function hasChild(parent: TreeNode, name: string): boolean {
    return childrenNamed(parent, name).length === 1;
}

const inputProject = new NodeFsLocalProject(null,
    "/Users/jessitron/code/atomist/upgrade-client-automation/src/passContextToClone/");

const fileOfInterest = "AddParameter.ts";
const findUnionTypeComponents = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]/UnionType/SyntaxList/TypeReference/Identifier";
const findTypeAlias = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]";

function delineateMatches(pxe: PathExpression) {
    return inputProject.findFile(fileOfInterest)
    // .then(f => f.replace(/\/\* \[[0-9\/]+] ->? \*\//g, ""))
    // .then(f => f.replace(/\/\* <?->? \*\//g, ""))
        .then(() => inputProject.flush())
        .then(() => findMatches(inputProject, TypeScriptES6FileParser,
            fileOfInterest,
            pxe))
        .then(mm => {
            const n = mm.length;
            mm.forEach((m, i) => {
                const startMarker = n > 1 ? `/* [${i}/${n}] -> */` : `/* -> */`;
                m.$value = startMarker + m.$value + "/* <- */"
            });
            if (n === 1) {
                logger.warn(printMatch(mm[0]).join("\n"));
            }
        }).then(() => inputProject.flush())
}

type PathExpression = string;

function matchesInFileOfInterest(pxe: PathExpression) {
    return findMatches(inputProject, TypeScriptES6FileParser,
        fileOfInterest,
        pxe,
    )
}

function reallyEdit() {
    return matchesInFileOfInterest(findUnionTypeComponents)
        .then(
            mm => {
                console.log("found " + mm.length + " matches");
                return mm.map(m => m.$value);
            }).then(interfacesInType =>
            runInSequence(inputProject,
                interfacesInType.map(iit => () => {
                    return turnInterfaceToType(iit)
                })))
        .then(() => turnUnionTypeToSuperclass());
}

const findInterface = (identifier: string) => `//InterfaceDeclaration[/Identifier[@value='${identifier}']]`;

function trimSemicolon(s: string): string {
    if (s.endsWith(";") || s.endsWith(",")) {
        return s.substr(0, s.length - 1);
    } else {
        return s;
    }
}

function turnUnionTypeToSuperclass(): Promise<void> {
    return matchesInFileOfInterest(findTypeAlias)
        .then(mm => {
            const unionType = requireExactlyOne(mm, "type alias" + mm.length);
            unionType.$value = superclassTemplate(changeUnionToSuperclassRequirement.name,
                changeUnionToSuperclassRequirement.commonFields)
        })
}

function turnInterfaceToType(ident: string): Promise<void> {
    return matchesInFileOfInterest(findInterface(ident))
        .then((interfaceMatches: MatchResult[]) => {
            const interfaceMatch = requireExactlyOne(interfaceMatches);
            const propMatches: MatchResult[] = interfaceMatch.evaluateExpression("//PropertySignature")
            const properties: ClassProperty[] = propMatches.map(propMatch => {
                const propertyName = identifier(propMatch);
                const optional = hasChild(propMatch, "QuestionToken");
                logger.warn("value is " + propMatch.$value);
                const propertyType = trimSemicolon(propMatch.$value.match(/:([\s\S]*)$/)[1].trim());
                return { propertyName, optional, propertyType }
            });
            const superclassPropertyNames =
                changeUnionToSuperclassRequirement.commonFields.map(p => p.propertyName)
            const kindProperty = requireExactlyOne(properties.filter(p => p.propertyName === "kind"));
            const myProperties = properties
                .filter(p => !superclassPropertyNames.includes(p.propertyName))
                .filter(p => p.propertyName !== "kind");
            const classDefinition = classTemplate(ident,
                changeUnionToSuperclassRequirement.name,
                kindProperty.propertyType,
                myProperties,
                changeUnionToSuperclassRequirement.commonFields);
            interfaceMatch.$value = classDefinition;
        });
}

function parameterNameAndType(f: ClassProperty) {
    return `${f.propertyName}${f.optional ? "?" : ""}: ${f.propertyType}`
}

const classTemplate = (name: string, superclass: string, kindString: string,
                       classFields: ClassProperty[],
                       superclassFields: ClassProperty[]): string => {

    // TODO: sort optional to last
    const constructorParameters = classFields.map(f =>
        `public ${parameterNameAndType(f)}`).concat(
        superclassFields.map(parameterNameAndType));
    const superclassConstructorArguments =
        superclassFields.map(f => f.propertyName);
    return `export class ${name} extends ${superclass} {
        public kind: ${kindString} = ${kindString};
        
        constructor(${constructorParameters.join(",\n")}) {
            super(${superclassConstructorArguments.join(", ")});
        } 
    }`
};

const superclassTemplate = (name: string, properties: ClassProperty[]): string => {
    const constructorParameters = properties.map(f =>
        `public ${parameterNameAndType(f)}`);
    return `export abstract class ${name} {
       public kind: string;
       constructor(${constructorParameters.join(",\n")}) {}     
   }`
}


interface ClassProperty {
    propertyName: string,
    optional: boolean,
    propertyType: string
}

const changeUnionToSuperclassRequirement = {
    name: "Requirement",
    commonFields: [{ propertyName: "why", optional: true, propertyType: "any" }],
};
//
// interface ChangeInterfaceToClassRequirement {
//     name: string,
//     superclass: string,
//     superclassFields: { name: "why?", typeName: "any"}]
// }

(logger as any).level = "warn";
console.log("where");
console.log("basedir: " + inputProject.baseDir);
inputProject.findFile(fileOfInterest)
    .then(() => printStructureOfFile(inputProject, fileOfInterest))
    .then(() => delineateMatches(findTypeAlias))
    .then(() => reallyEdit())
    .then(() => inputProject.flush())
    .then(() => {
        logger.warn("DONE")
    })
    .catch((error) => logger.error(error.message));
