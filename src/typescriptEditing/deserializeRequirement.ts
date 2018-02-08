import { isPassArgumentRequirement, PassArgumentRequirement } from "./PassArgumentRequirement";
import { AddMigrationRequirement, isAddMigrationRequirement } from "./AddMigrationRequirement";
import { AddParameterRequirement, isAddParameterRequirement } from "./AddParameterRequirement";
import { isPassDummyInTests, PassDummyInTestsRequirement } from "./PassDummyInTestRequirement";
import { Requirement } from "./TypescriptEditing";


export function deserializeRequirement(data: any): Requirement {
    if (isPassArgumentRequirement(data)) {
        return new PassArgumentRequirement(data);
    } else if (isAddMigrationRequirement(data)) {
        return new AddMigrationRequirement(data.downstreamRequirement, data.why)
    } else if (isAddParameterRequirement(data)) {
        return new AddParameterRequirement(data);
    } else if (isPassDummyInTests(data)) {
        return new PassDummyInTestsRequirement(data);
    } else {
        throw new Error("Unrecognized requirement kind: " + data.kind);
    }
}