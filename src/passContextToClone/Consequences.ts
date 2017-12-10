

import { TypescriptEditing } from "./TypescriptEditing";


export interface Consequences {
    concomitantChanges: TypescriptEditing.Requirement[],
    prerequisiteChanges: TypescriptEditing.Requirement[]
}

export function combineConsequences(c1: Consequences, c2: Consequences): Consequences {
    return {
        concomitantChanges: c1.concomitantChanges.concat(c2.concomitantChanges),
        prerequisiteChanges: c1.prerequisiteChanges.concat(c2.prerequisiteChanges),
    }
}

export function concomitantChange(r: TypescriptEditing.Requirement): Consequences {
    return {
        concomitantChanges: [r],
        prerequisiteChanges: [],
    }
}

export const emptyConsequences: Consequences = {
    concomitantChanges: [],
    prerequisiteChanges: [],
}
