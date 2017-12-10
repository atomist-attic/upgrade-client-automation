import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { Project } from "@atomist/automation-client/project/Project";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import { logger } from "@atomist/automation-client";
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";
import { LocatedTreeNode } from "@atomist/automation-client/tree/LocatedTreeNode";
import stringify = require("json-stringify-safe");
import { AddParameter } from "../passContextToClone/AddParameter";
import FunctionCallIdentifier = AddParameter.FunctionCallIdentifier;
import { functionCallIdentifierFromTreeNode } from "../passContextToClone/addParameterImpl";

/*
 * To run this while working:
 *
 * cd src/
 * watch "git checkout passContextToClone; ts-node jess/ModifyAddParameter.ts" jess
 *
 * and then push alt-cmd-Y in IntelliJ on AddParameter.ts to refresh it
 *
 * next:
 */

function printStructureOfFile(project: Project, path: string,
                              howToPrint: (s: string) => void = (s) => console.log(s)) {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile`)
        .then(matches => {
            if (matches.length === 0) {
                console.log("no matches found!")
            }
            matches.forEach(m => {
                howToPrint(printMatch(m).join("\n"));
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
    "/Users/jessitron/code/atomist/upgrade-client-automation/");

const fileOfInterest = "src/passContextToClone/AddParameter.ts";
const findUnionTypeComponents = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]/UnionType/SyntaxList/TypeReference/Identifier";
const findTypeAlias = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]";

function delineateMatches(filePath: string, pxe: PathExpression) {
    return inputProject.findFile(filePath)
    // .then(f => f.replace(/\/\* \[[0-9\/]+] ->? \*\//g, ""))
    // .then(f => f.replace(/\/\* <?->? \*\//g, ""))
        .then(() => inputProject.flush())
        .then(() => findMatches(inputProject, TypeScriptES6FileParser,
            filePath,
            pxe))
        .then(mm => {
            const n = mm.length;
            mm.forEach((m, i) => {
                const startMarker = n > 1 ? `/* [${i + 1}/${n}] -> */` : `/* -> */`;
                m.$value = startMarker + m.$value + "/* <- */"
            });
            if (n === 0) {
                logger.warn("no matches to delineate: " + pxe)
            }
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
            }).then(interfacesInType => gatherKinds(interfacesInType).then((kinds: InterfaceKind[]) => {
            const makeThemIntoClasses = interfacesInType.map(iit => () => {
                return turnInterfaceToType(iit)
            });
            const callTheConstructors = kinds.map(ik => () =>
                turnInstanceCreationIntoConstructorCalls(ik));
            return runInSequence(inputProject,
                makeThemIntoClasses.concat(callTheConstructors))
        }))
        .then(() => turnUnionTypeToSuperclass());
}

interface InterfaceKind {
    name: string,
    kind: KindString
}


function findInstanceCreation(kind: KindString): PathExpression {
    return `//ObjectLiteralExpression[/SyntaxList/PropertyAssignment[/Identifier[@value='kind']][/StringLiteral[@value='${kind}']]]`;
}

function turnInstanceCreationIntoConstructorCalls(interfaceAndKind: InterfaceKind): Promise<void> {
    return findMatches(inputProject, TypeScriptES6FileParser, "**/*.ts",
        findInstanceCreation(interfaceAndKind.kind)).then(mm => {
        mm.forEach(m => {
            const removeKindProperty = m.$value.replace(new RegExp(`\s*kind: "${interfaceAndKind.kind}",?[\n]?`), "");
            return m.$value = `new ${interfaceAndKind.name}(${removeKindProperty})`;
        })
    })
}

type KindString = string;

/* does not include quotes */
function gatherKinds(interfaceNames: string[]): Promise<InterfaceKind[]> {
    return Promise.all(
        interfaceNames.map(ident =>
            matchesInFileOfInterest(findInterface(ident) + "//PropertySignature[/Identifier[@value='kind']]/LastTypeNode/StringLiteral")
                .then(mm => {
                    const km = requireExactlyOne(mm);
                    return { kind: trimSemicolon(km.$value), name: ident };
                })));
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
            const propMatches: MatchResult[] = interfaceMatch.evaluateExpression("/SyntaxList/PropertySignature");
            const properties: ClassProperty[] = propMatches.map(propMatch => {
                const propertyName = identifier(propMatch);
                const optional = hasChild(propMatch, "QuestionToken");
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

    const propertyDeclarations = classFields.map(f =>
        `public ${parameterNameAndType(f)};`);
    const populatePropertyFromParams = classFields.map(f =>
        `this.${f.propertyName} = params.${f.propertyName};`);

    const constructorParameterObjectPropertyDeclarations = classFields.concat(superclassFields).map(f =>
        parameterNameAndType(f));
    const superclassConstructorArguments =
        superclassFields.map(f => `params.${f.propertyName}`);
    return `export class ${name} extends ${superclass} {
        public readonly kind: ${kindString} = ${kindString};
        
        ${propertyDeclarations.join("\n")}
        
        constructor(params: {${constructorParameterObjectPropertyDeclarations.join(",\n")}}) {
            super(${superclassConstructorArguments.join(", ")});
            ${populatePropertyFromParams.join("\n")}
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

function changeUnionToSuperclass() {
    console.log("where");
    console.log("basedir: " + inputProject.baseDir);
    return inputProject.findFile(fileOfInterest)
        .then(() => printStructureOfFile(inputProject, fileOfInterest))
        .then(() => delineateMatches(fileOfInterest, findInstanceCreation("Pass Argument")))
        .then(() => reallyEdit())
        .then(() => inputProject.flush())
        .then(() => {
            logger.warn("DONE")
        })
        .catch((error) => logger.error(error.message));
}

// function moveFunctionsAround() {
//     const moveInterfaceRequirement = {
//         fromFilePath: "src/passContextToClone/AddParameter.ts",
//         interfaceSpec: {
//             name: "AddParameterRequirement"
//         }
//     }
// }

//changeUnionToSuperclass();

const stupidImports = "//ImportEqualsDeclaration[//FirstNode]";

function dontImportFunctionsOrClassesThisWay() {

    const fileOfInterest2 = "test/passContextToClone/editorTest.ts";

    return inputProject.findFile(fileOfInterest2)
        .then(() => printStructureOfFile(inputProject, fileOfInterest2,
            (s) => logger.warn(s)))
        .then(() => delineateMatches(fileOfInterest2, stupidImports))
        .then(() =>
            findMatches(inputProject, TypeScriptES6FileParser, "**/*.ts",
                stupidImports))
        .then(mm =>
            mm.map(stupidImport => {
                const ident = identifier(stupidImport)
                const fullName = requireExactlyOne(
                    childrenNamed(stupidImport, "FirstNode"), printMatch(stupidImport).join("\n")).$value;
                return {
                    path: (stupidImport as LocatedTreeNode).sourceLocation.path,
                    importName: ident, newName: fullName,
                    wholeImport: stupidImport.$value,
                }
            }))
        .then(data => {
            logger.warn(stringify(data, null, 2));
            return data;
        })
        .then(data => {
            return runInSequence(inputProject, data.map(d => () => {
                return inputProject.findFile(d.path).then(file => file.getContent()
                    .then(content => {
                        const newContent = content.replace(d.wholeImport, "")
                            .replace(new RegExp("\\s" + d.importName, "g"), " " + d.newName);
                        return file.setContent(newContent)
                    }).then(() => Promise.resolve()))
            }))
        }).then(() => inputProject.flush());

}

//
// dontImportFunctionsOrClassesThisWay()
//     .then(() => {
//         logger.warn("DONE")
//     }).catch((error) => logger.error(error.message));

const findSubclassesPxe = (superclassName: string): PathExpression =>
    `//ClassDeclaration[//HeritageClause[//Identifier[@value='${superclassName}']]]`;

const findTypeGuardFunctions = (guardedType: string): PathExpression =>
    `//FunctionDeclaration[/FirstTypeNode[/IsKeyword][//Identifier[@value='${guardedType}']]]`;

interface ClassSpec {
    name: string,
    filePath: string,
}

function findSubclasses(project: Project, glob: string, superclassName: string): Promise<ClassSpec[]> {
    return findMatches(project, TypeScriptES6FileParser, glob, findSubclassesPxe(superclassName))
        .then(mm => mm.map(subclassMatch => {
            return {
                name: identifier(subclassMatch),
                filePath: (subclassMatch as LocatedTreeNode).sourceLocation.path,
            }
        }))
}

/*
* assumes there is exactly one typeguard function for this class
 */
function findTypeGuardFunction(project: Project, glob: string, typeName: string): Promise<FunctionCallIdentifier> {
    return findMatches(project, TypeScriptES6FileParser, glob, findTypeGuardFunctions(typeName))
        .then(mm => {
                const m = requireExactlyOne(mm);
                return functionCallIdentifierFromTreeNode(m)
            },
        );
}

function moveFunctionsToMethods() {
    /* let's find functions that call isBlahBlah */
    return delineateMatches(fileOfInterest, findTypeGuardFunctions("AddParameterRequirement"))
        .then(() =>
            delineateMatches(fileOfInterest, findSubclassesPxe("Requirement")))
        .then(() => findSubclasses(inputProject, fileOfInterest, "Requirement"))
        .then(subclasses => Promise.all(subclasses.map(subclass =>
            findTypeGuardFunction(inputProject, subclass.filePath, subclass.name))))
        .then(typeGuardFunctions => {
            logger.warn("Type guards: " + stringify(typeGuardFunctions))
            return typeGuardFunctions;
        });
}


(logger as any).level = "warn";
moveFunctionsToMethods().then(() => {
    logger.warn("DONE")
}, (error) => logger.error(error.toString()));
