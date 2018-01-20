/*
 * Fake the pushed fingerprints
 */
import { Fingerprint, FingerprintedCommit, PushFingerprintWorld } from "../src/dependencyVersion/fingerprint";

export const pushedFingerprints: {
    [key: string]: { commit: FingerprintedCommit, fingerprints: Fingerprint[] }
} = {};

function fakePushFingerprint(commit: FingerprintedCommit,
                             ...fingerprints: Fingerprint[]) {
    console.log("Fake Push Fingerprint! " + commit.sha);
    pushedFingerprints[commit.sha] = { commit, fingerprints };
    return Promise.resolve();
}

console.log("Overriding pushFingerprint");
PushFingerprintWorld.pushFingerprint = fakePushFingerprint;