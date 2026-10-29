#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPlaytestRecord } from './lib/playtest-export.mjs';

export const MAX_COHORT_FILES = 100;
export const MAX_RECORD_BYTES = 20_000_000;
export const MAX_COHORT_BYTES = 40_000_000;

// The receiver has already verified every input. A later download of the same
// session can extend its earlier journal, but must not turn one session into two.
function prefixOf(earlier, later) {
  return earlier.length <= later.length && earlier.every((event, index) =>
    JSON.stringify(event) === JSON.stringify(later[index]));
}

export async function summarizePlaytestCohort(rawRecords) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0 || rawRecords.length > MAX_COHORT_FILES) {
    throw new Error(`Supply between 1 and ${MAX_COHORT_FILES} verified play records.`);
  }
  // Reverify the original envelopes here, rather than trusting a caller-supplied
  // `verified` flag or allowing a report to inherit a forged success claim.
  const records = [];
  for (const raw of rawRecords) records.push(await readPlaytestRecord(raw));
  const sessions = new Map();
  for (const record of records) {
    if (record?.integrity?.verified !== true ||
        typeof record.sessionId !== 'string' || !record.sessionId.trim() ||
        typeof record.integrity.episodeSha256 !== 'string' ||
        typeof record.integrity.bindingSha256 !== 'string' ||
        !record.episode || !Array.isArray(record.events) ||
        !record.validation?.result?.summary) {
      throw new Error('Every input must be a recomputed, verified playtest record.');
    }
    const matches = sessions.get(record.sessionId) ?? [];
    matches.push(record);
    sessions.set(record.sessionId, matches);
  }

  const groups = new Map();
  let duplicateFiles = 0, supersededSnapshots = 0;
  for (const snapshots of sessions.values()) {
    snapshots.sort((a, b) => b.events.length - a.events.length ||
      a.integrity.bindingSha256.localeCompare(b.integrity.bindingSha256));
    const latest = snapshots[0];
    const seen = new Set();
    for (const record of snapshots) {
      if (record.integrity.episodeSha256 !== latest.integrity.episodeSha256 ||
          !prefixOf(record.events, latest.events) ||
          (record.events.length === latest.events.length &&
            record.integrity.bindingSha256 !== latest.integrity.bindingSha256)) {
        throw new Error('Conflicting records reuse one session ID. No cohort result was produced.');
      }
      if (seen.has(record.integrity.bindingSha256)) duplicateFiles++;
      else if (record.events.length < latest.events.length) supersededSnapshots++;
      seen.add(record.integrity.bindingSha256);
    }
    const hash = latest.integrity.episodeSha256;
    if (!groups.has(hash)) {
      const { id, revision, locale, title } = latest.episode;
      groups.set(hash, {
        episode: { id, revision, locale, title, sha256: hash },
        recorded: {
          sessions: 0, sessionsWithSuccess: 0, sessionsWithHints: 0,
          sessionsWithReveal: 0, attempts: 0, successfulAttempts: 0,
          moves: 0, hintsShown: 0, resets: 0
        }
      });
    }
    const totals = groups.get(hash).recorded;
    const summary = latest.validation.result.summary;
    totals.sessions++;
    totals.sessionsWithSuccess += Number(summary.successfulAttempts > 0);
    totals.sessionsWithHints += Number(summary.hintsShown > 0);
    totals.sessionsWithReveal += Number(summary.revealUsed === true);
    for (const name of ['attempts', 'successfulAttempts', 'moves', 'hintsShown', 'resets']) {
      totals[name] += summary[name];
    }
  }
  return {
    schema: 'ludolingua.playtest-cohort-report.v1',
    integrity: { allInputRecordsRecomputed: true },
    inputs: { verifiedFiles: records.length, uniqueSessions: sessions.size,
      duplicateFiles, supersededSnapshots },
    episodes: [...groups.values()].sort((a, b) => a.episode.sha256.localeCompare(b.episode.sha256)),
    limitations: [
      'Session IDs and event histories are client-created, not independently authenticated people or play.',
      'Recorded success, hints and reveals are not proof of unaided solving or the absence of outside assistance.',
      'Grouping by exact episode hash does not establish comparable difficulty or translation quality.',
      'Self-reported timing is deliberately excluded; this report does not certify native-language proficiency, human quality or model contribution.'
    ]
  };
}

export async function runCli(paths = process.argv.slice(2)) {
  try {
    if (paths.length === 0 || paths.length > MAX_COHORT_FILES) {
      throw new Error(`Usage: node playtest-cohort.mjs <record1.json> [record2.json ...] (1-${MAX_COHORT_FILES} files)`);
    }
    let bytes = 0;
    const records = [];
    for (const path of paths) {
      const info = await stat(path);
      if (!info.isFile() || info.size > MAX_RECORD_BYTES) {
        throw new Error('An input is not a regular file or exceeds the 20 MB record limit.');
      }
      bytes += info.size;
      if (bytes > MAX_COHORT_BYTES) throw new Error('The combined input exceeds the 40 MB cohort limit.');
      records.push(await readFile(path, 'utf8')); 
    }
    process.stdout.write(JSON.stringify(await summarizePlaytestCohort(records), null, 2) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
