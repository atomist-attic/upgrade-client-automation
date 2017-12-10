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
import * as TypescriptEditing from "../passContextToClone/TypescriptEditing";
import FunctionCallIdentifier = TypescriptEditing.FunctionCallIdentifier;
import {
    functionCallIdentifierFromTreeNode, functionCallPathExpression, localFunctionCallPathExpression,
    pathExpressionIntoScope,
} from "../passContextToClone/addParameterImpl";

/*
 * To run this while working:
 *
 * cd src/
 * watch "git checkout passContextToClone; ts-node jess/ModifyAddParameter.ts" jess
 *
 * and then push alt-cmd-Y in IntelliJ on TypescriptEditing.ts to refresh it
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

function firstChildNamed(parent: TreeNode, name: string): TreeNode {
    const childs = childrenNamed(parent, name);
    if (childs.length === 0) {
        throw new Error("No children at all named " + name + " on " + parent.$name);
    }
    return childs[0];
}

function hasChild(parent: TreeNode, name: string): boolean {
    return childrenNamed(parent, name).length === 1;
}

const inputProject = new NodeFsLocalProject(null,
    "/Users/jessitron/code/atomist/upgrade-client-automation/");

const fileOfInterest = "src/passContextToClone/TypescriptEditing.ts";
const findUnionTypeComponents = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]/UnionType/SyntaxList/TypeReference/Identifier";
const findTypeAlias = "/SourceFile//TypeAliasDeclaration[/Identifier[@value='Requirement']]";

function delineateMatches(filePath: string, pxe: PathExpression) {
    return inputProject.findFile(filePath)
    // these would delete previous delineations, but using `git checkout` between runs is better
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
            } else {
                logger.warn("First match for: " + pxe);
                logger.warn(printMatch(mm[0]).join("\n"));
            }
        }).then(() => inputProject.flush())
        .catch(error => {
            logger.error("Failed path expression: " + pxe);
            return Promise.reject(error)
        })
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
//         fromFilePath: "src/passContextToClone/TypescriptEditing.ts",
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

interface If {
    condition: string,
    body: string
}

// assumes local scope, does not find namespaced calls
const findFunctionsThatCall = (whatTheyCall: FunctionCallIdentifier): PathExpression =>
    `${pathExpressionIntoScope(whatTheyCall.enclosingScope) +
    `//FunctionDeclaration[${localFunctionCallPathExpression(whatTheyCall.name)}]`}`;


// does the enclosing function start with if(functionItChecks(...))
function startsWithCheck(functionItChecks: FunctionCallIdentifier, enclosingFunction: TreeNode): boolean {
    const block = firstChildNamed(enclosingFunction, "Block");
    const syntax = firstChildNamed(block, "SyntaxList");
    const ifStatement = syntax.$children[0];
    if (ifStatement.$name !== "IfStatement") {
        return false;
    }
    // if
    // (
    // functionItChecks
    const thirdChild = ifStatement.$children[2];
    if (thirdChild.$name !== "CallExpression") {
        return false;
    }
    // This assumes local scope!!
    if (identifier(thirdChild) !== functionItChecks.name) {
        return false;
    }
    return true;
}

function functionsThatCheck(project: Project, glob: string,
                            functionTheyCall: FunctionCallIdentifier): Promise<FunctionCallIdentifier[]> {

    const pxe = findFunctionsThatCall(functionTheyCall);
    return findMatches(project, TypeScriptES6FileParser, glob, pxe)
        .then(mm => mm
            .filter(m => startsWithCheck(functionTheyCall, m))
            .map(m => functionCallIdentifierFromTreeNode(m)))
}

/**
 * OK. Look, here's where I'm leaving off.
 *
 * I want to convert functions like describeRequirement, implement, and findConsequencesOfOne
 * to methods.
 * So far, I can identify those functions, functions that first make a call to a typeguard
 * of one of the subclasses of Requirement. ("checky functions")
 *
 * Converting that into instructions for AddMethod gets tricky -
 * what I want is to parse the body of the checky function, something like
 * Rep(`if($typeGuardMethodCall($arg)) {
 *    $bodyOfNewMethodOnGuardedType
 * }`) Opt(else) ${bodyOfSuperclassMethod}
 *
 * that is, I want microgrammars to do this.
 * The critical feature that I need in microgrammars is balancing of delimiters:
 * when a set of parens or curly braces appear in a microgrammar expression, they
 * match sets that balance in the parsed code (accounting for all delimiters in the language,
 * quotes and curlies and square braces and parens).
 *
 * To continue down this path then, means copying something like:
 export function describeRequirement(r: Requirement): string {
        if (isAddParameterRequirement(r)) {
            return describeAddParameter(r)
        } else if (isPassArgumentRequirement(r)) {
            return describePassArgument(r);
        } else if (isPassDummyInTests(r)) {
            return describePassDummyInTests(r);
        } else {
            return stringify(r);
        }
  }
 *
 * into microgrammar test suite and trying to parse it.
 * This is what I've been wanting to implement in microgrammars.
 *
 * However, right now, the need to turn this whole passContextToClone editor
 * into one that constructs editors for downstream systems as well
 * is much more important and also hard and compelling.
 *
 * For the weekend, I will call it a success that I converted Requirements into classes
 * at all.
 */
function moveFunctionsToMethods() {
    /* let's find functions that call isBlahBlah */
    return delineateMatches(fileOfInterest,
        findFunctionsThatCall({
            name: "isAddParameterRequirement",
            access: { kind: "PublicFunctionAccess" },
        } as FunctionCallIdentifier) + "//IfStatement")
        .then(() => findSubclasses(inputProject, fileOfInterest, "Requirement"))
        .then(subclasses => Promise.all(subclasses.map(subclass =>
            findTypeGuardFunction(inputProject, subclass.filePath, subclass.name))))
        .then(typeGuardFunctions => {
            logger.warn("Type guards: " + stringify(typeGuardFunctions));
            return typeGuardFunctions;
        }).then(typeGuardFunctions => Promise.all(typeGuardFunctions.map(t =>
            functionsThatCheck(inputProject, fileOfInterest, t)))
            .then(a => _.flatten(a)))
        .then((checkyFunctions: FunctionCallIdentifier[]) => {
            logger.warn("Functions that check type guards: " + checkyFunctions.map(c => stringify(c)).join("\n"))
            return checkyFunctions
        });
}

interface CheckyFunction {
    fci: FunctionCallIdentifier;

}

function whatMethodsToAdd(checkyFunction: CheckyFunction): AddMethodToClass[] {
    return []
}


interface AddMethodToClass {
    classSpec: ClassSpec,
    name: string,
    returnType: string,
    /* if body is null, method is abstract */
    body?: string
}

function addMethodToClass(project: Project, requirement: AddMethodToClass): Promise<void> {
    return findMatches(project, TypeScriptES6FileParser, requirement.classSpec.filePath,
        `//ClassDeclaration[/Identifier[@value='${requirement.classSpec.name}']]`)
        .then(mm => {
            const m = requireExactlyOne(mm);
            // find block
            // add method before last curly brace
        })
}

const newMethodTemplate = (name: string, returnType: string, body: string) => {
    if (body) {
        return `
    public ${name}(): ${returnType} {
        ${body}
    }
`
    } else {
        return `\npublic ${name}(): ${returnType};\n`
    }
};

function findFunctionDeclarationsInNamespacePxe(name: string): PathExpression {
    const namespaceBlock = `//ModuleDeclaration[/Identifier[@value='${name}']]/ModuleBlock`;

  //  return `${namespaceBlock}//ClassDeclaration | ${namespaceBlock}//FunctionDeclaration`;
    return `${namespaceBlock}//FunctionDeclaration`;
}

function findDeclarationsInNamespace(project: Project, glob: string, namespaceName: string): Promise<FunctionCallIdentifier[]> {
    return findMatches(project, TypeScriptES6FileParser, glob,
        findFunctionDeclarationsInNamespacePxe(namespaceName))
        .then(mm => mm.map(m => functionCallIdentifierFromTreeNode(m)))
}

/**
 * OK. I can find the functions,
 * and I know how to find calls to those functions
 * and then I could modify those calls.
 * I also need to change the imports, to import them all individually ...
 */
function removeNamespace(namespaceName: string, filePath: string) {
    return findDeclarationsInNamespace(inputProject, filePath, namespaceName)
        .then(declarationNames =>
        {
            logger.warn("Declarations to move: " + stringify(declarationNames));
            return declarationNames;
        })
}

(logger as any).level = "warn";
removeNamespace("TypescriptEditing", fileOfInterest).then(() => {
    logger.warn("DONE")
}, (error) => logger.error(error.toString()));
