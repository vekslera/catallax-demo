/**
 * timing.ts — the store's clock constants.
 *
 * Shared with the tests so the scenario can be replayed on a virtual timeline
 * that matches the real one. Beat 6 depends on it: the hardware failure has to
 * land while the buyer's job is still executing, which is the whole reason the
 * buyer is harmed and the stake pays out.
 */

export const ATTEST_TICK_MS = 450;
export const ATTEST_SETTLE_MS = 900;
export const JOB_START_MS = 200;
export const JOB_EXECUTE_MS = 2000;
export const JOB_VERIFY_MS = 1000;
export const ARB_TICK_MS = 250;
