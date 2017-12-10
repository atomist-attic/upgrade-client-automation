import { AddImport } from "./manipulateImports";
import stringify = require("json-stringify-safe");
import { Project } from "@atomist/automation-client/project/Project";
import { logger } from "@atomist/automation-client";
import { addParameter, findConsequencesOfAddParameter, passArgument, passDummyInTests } from "./addParameterImpl";
import { Report, reportUnimplemented } from "./Report";
import { Consequences, emptyConsequences } from "./Consequences";
import { Changeset } from "./Changeset";


export namespace AddParameter {

    /*
     * Requirements describe what we need to do
     */
    export abstract class Requirement {
        public kind: string;

        constructor(public why?: any) {
        }

        public sameRequirement(other: Requirement): boolean {
            return false;
        }
    }

    export type EnclosingScope = ClassAroundMethod | EnclosingNamespace

    export interface ClassAroundMethod {
        kind: "class around method",
        name: string,
        exported: boolean,
        enclosingScope?: EnclosingScope
    }

    export interface EnclosingNamespace {
        kind: "enclosing namespace",
        name: string,
        exported: boolean,
        enclosingScope?: EnclosingScope
    }

    export function isClassAroundMethod(es: EnclosingScope): es is ClassAroundMethod {
        return es.kind === "class around method";
    }

    function isSameScope(s1: EnclosingScope, s2: EnclosingScope): boolean {
        if (s1 === undefined && s2 === undefined) {
            return true
        }
        return s1.kind === s2.kind && s1.name === s2.name && isSameScope(s1.enclosingScope, s2.enclosingScope)
    }

    export type FunctionCallIdentifier = {
        enclosingScope?: EnclosingScope,
        name: string, filePath: string
        access: Access
    };

    function sameFunctionCallIdentifier(r1: FunctionCallIdentifier, r2: FunctionCallIdentifier) {
        return r1.name === r2.name &&
            r1.filePath === r2.filePath &&
            isSameScope(r1.enclosingScope, r2.enclosingScope)
    }

    export function sameRequirement(r1: Requirement, r2: Requirement): boolean {
        return r1.kind === r2.kind && r1.sameRequirement(r2)

    }

    export type Access = PublicFunctionAccess | PrivateFunctionAccess | PrivateMethodAccess

    export function globFromAccess(fci: FunctionCallIdentifier) {
        if (isPublicFunctionAccess(fci.access)) {
            return "**/*.ts"
        } else {
            return fci.filePath;
        }
    }

    export interface PublicFunctionAccess {
        kind: "PublicFunctionAccess",
    }

    export interface PrivateMethodAccess {
        kind: "PrivateMethodAccess",
    }

    export type PathExpression = string;

    export interface PrivateFunctionAccess {
        kind: "PrivateFunctionAccess",
    }

    export function isPrivateFunctionAccess(scope: Access): scope is PrivateFunctionAccess {
        return scope.kind === "PrivateFunctionAccess";
    }

    export function isPublicFunctionAccess(scope: Access): scope is PublicFunctionAccess {
        return scope.kind === "PublicFunctionAccess";
    }

    export function isPrivateMethodAccess(scope: Access): scope is PrivateMethodAccess {
        return scope.kind === "PrivateMethodAccess";
    }

    function qualifiedName(fci: FunctionCallIdentifier) {
        return qualify(fci.enclosingScope, fci.name)
    }

    function qualify(s: EnclosingScope, soFar: string): string {
        if (s === undefined) {
            return soFar;
        }
        return qualify(s.enclosingScope, s.name + "." + soFar);
    }

    export class AddParameterRequirement extends Requirement {
        public readonly kind: "Add Parameter" = "Add Parameter";

        public functionWithAdditionalParameter: FunctionCallIdentifier;
        public parameterType: AddImport.ImportIdentifier;
        public parameterName: string;
        public populateInTests: {
            dummyValue: string;
            additionalImport?: AddImport.ImportIdentifier;
        };

        constructor(params: {
            functionWithAdditionalParameter: FunctionCallIdentifier,
            parameterType: AddImport.ImportIdentifier,
            parameterName: string,
            populateInTests: {
                dummyValue: string;
                additionalImport?: AddImport.ImportIdentifier;
            },
            why?: any
        }) {
            super(params.why);
            this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
            this.parameterType = params.parameterType;
            this.parameterName = params.parameterName;
            this.populateInTests = params.populateInTests;
        }

        public sameRequirement(other: Requirement): boolean {
            return isAddParameterRequirement(other) &&
                sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter) &&
                this.parameterName === other.parameterName
        }
    }

    function describeAddParameter(r: AddParameterRequirement): string {
        return `Add parameter "${r.parameterName}: ${r.parameterType.name}" to ${qualifiedName(r.functionWithAdditionalParameter)}`
    }

    export class PassDummyInTestsRequirement extends Requirement {
        public readonly kind: "Pass Dummy In Tests" = "Pass Dummy In Tests";

        public functionWithAdditionalParameter: FunctionCallIdentifier;
        public dummyValue: string;
        public additionalImport?: AddImport.ImportIdentifier;

        constructor(params: {
            functionWithAdditionalParameter: FunctionCallIdentifier,
            dummyValue: string,
            additionalImport?: AddImport.ImportIdentifier,
            why?: any
        }) {
            super(params.why);
            this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
            this.dummyValue = params.dummyValue;
            this.additionalImport = params.additionalImport;
        }

        public sameRequirement(other: Requirement): boolean {
            return isPassDummyInTests(other) &&
                sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter)
        }
    }

    function describePassDummyInTests(r: PassDummyInTestsRequirement): string {
        return `Pass dummy value to ${qualifiedName(r.functionWithAdditionalParameter)} in tests`
    }


    export class PassArgumentRequirement extends Requirement {
        public readonly kind: "Pass Argument" = "Pass Argument";

        public enclosingFunction: FunctionCallIdentifier;
        public functionWithAdditionalParameter: FunctionCallIdentifier;
        public argumentValue: string;

        constructor(params: {
            enclosingFunction: FunctionCallIdentifier,
            functionWithAdditionalParameter: FunctionCallIdentifier,
            argumentValue: string,
            why?: any
        }) {
            super(params.why);
            this.enclosingFunction = params.enclosingFunction;
            this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
            this.argumentValue = params.argumentValue;
        }

        public sameRequirement(other: Requirement): boolean {
            return isPassArgumentRequirement(other) &&
                sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter) &&
                sameFunctionCallIdentifier(this.enclosingFunction, other.enclosingFunction)
        }
    }

    function describePassArgument(r: PassArgumentRequirement): string {
        return `Pass argument "${r.argumentValue}" to ${qualifiedName(r.functionWithAdditionalParameter)} in ${qualifiedName(r.enclosingFunction)}`
    }

    export function isPassDummyInTests(r: Requirement): r is PassDummyInTestsRequirement {
        return r.kind === "Pass Dummy In Tests";
    }

    export function isAddParameterRequirement(r: Requirement): r is AddParameterRequirement {
        return r.kind === "Add Parameter";
    }


    export function isPassArgumentRequirement(r: Requirement): r is PassArgumentRequirement {
        return r.kind === "Pass Argument";
    }

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

    /*
     * Requirements can have consequences, which are additional changes
     * that have to be implemented in order to implement this one.
     */
    function findConsequencesOfOne(project: Project, requirement: Requirement): Promise<Consequences> {
        if (isAddParameterRequirement(requirement)) {
            logger.info("Finding consequences of: " + stringify(requirement, null, 1));
            return findConsequencesOfAddParameter(project, requirement);
        } else {
            return Promise.resolve(emptyConsequences);
        }
    }

    export function changesetForRequirement(project: Project, requirement: Requirement): Promise<Changeset> {
        return findConsequences(project, [requirement], [], [])
            .then(theseConsequences => Promise.all(
                theseConsequences.prerequisiteChanges
                    .map(r => AddParameter.changesetForRequirement(project, r)))
                .then(prerequisiteChangesets =>
                    ({
                        titleRequirement: requirement,
                        requirements: theseConsequences.concomitantChanges,
                        prerequisites: prerequisiteChangesets,
                    })));
    }

    /**
     *  Find all concomitant changes and their prerequisite requirements
     *  unchecked: concomitant changes whose consequences we haven't calculated. grows as more are discovered
     *  checked: concomitant changes whose consequences are already calculated and in the lists; accumulate and dedup
     *  prerequisites: prerequisite changes from any of the checked concomitant changes; accumulate only
     */
    function findConsequences(project: Project,
                              unchecked: Requirement[],
                              checked: Requirement[],
                              prerequisites: Requirement[]): Promise<Consequences> {
        if (unchecked.length === 0) {
            return Promise.resolve({ concomitantChanges: checked, prerequisiteChanges: prerequisites });
        }
        const thisOne = unchecked.pop(); // mutation
        if (checked.some(o => sameRequirement(o, thisOne))) {
            logger.info("Already checked " + stringify(thisOne));
            return findConsequences(project, unchecked, checked, prerequisites);
        }
        return findConsequencesOfOne(project, thisOne).then(consequences => {
            checked.push(thisOne);
            return findConsequences(project,
                unchecked.concat(consequences.concomitantChanges),
                checked,
                prerequisites.concat(consequences.prerequisiteChanges))
        });
    }

    export function implement(project: Project, requirement: Requirement): Promise<Report> {
        logger.info("Implementing: " + stringify(requirement, null, 2));
        if (isAddParameterRequirement(requirement)) {
            return addParameter(project, requirement);
        }
        if (isPassDummyInTests(requirement)) {
            return passDummyInTests(project, requirement);
        }
        if (isPassArgumentRequirement(requirement)) {
            return passArgument(project, requirement);
        }
        return Promise.resolve(reportUnimplemented(requirement, "I don't know how to implement that yet"))
    }


}
