
/*
 * Report is the output of attempting to implement requirements.
 */
import * as TypescriptEditing from "./TypescriptEditing";


export interface Unimplemented {
    requirement: TypescriptEditing.Requirement,
    message: string,
}

export interface Report {
    unimplemented: Unimplemented[]

    implemented: TypescriptEditing.Requirement[]
}

export const emptyReport: Report = {
    unimplemented: [],
    implemented: [],
};

export function reportUnimplemented(requirement: TypescriptEditing.Requirement, message: string): Report {
    return {
        unimplemented: [{ requirement, message }],
        implemented: [],
    }
}

export function reportImplemented(requirement: TypescriptEditing.Requirement): Report {
    return {
        unimplemented: [],
        implemented: [requirement],
    }
}

export function combine(report1: Report, report2: Report): Report {
    return {
        unimplemented: report1.unimplemented.concat(report2.unimplemented),
        implemented: report1.implemented.concat(report2.implemented),
    }
}