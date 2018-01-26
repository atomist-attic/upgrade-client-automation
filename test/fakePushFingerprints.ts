/*
 * Fake the pushed fingerprints
 */
import { Fingerprint, WhereToFingerprint, PushFingerprintWorld } from "../src/dependencyVersion/fingerprint";
import { ProjectInTheWorld } from "./jessFakesTheWorld";

const pushedFingerprints: {
    [key: string]: { commit: WhereToFingerprint, fingerprints: Fingerprint[] }
} = {};

function fakePushFingerprint(commit: WhereToFingerprint,
                             ...fingerprints: Fingerprint[]) {
    console.log("Fake Push Fingerprint! " + commit.sha);
    pushedFingerprints[commit.sha] = { commit, fingerprints };
    return Promise.resolve();
}

export function observePushedFingerprints(pitw: ProjectInTheWorld) {
    return pushedFingerprints[pitw.latestSha];
}

console.log("Overriding pushFingerprint");
PushFingerprintWorld.pushFingerprint = fakePushFingerprint;