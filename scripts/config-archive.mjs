/**
 * config-archive — a set of config files as the gzipped tar the engine's `POST /config` accepts
 * (2026-10-09, backlog row config-publish-in-the-api).
 *
 * The engine reads config only as a tar (`server/app.py` `config_push`, which extracts it, test-
 * loads it with its own bundle loader — Gate 2 — and only then switches over). Until now the tar
 * came from a laptop (`git archive` or `graph-sync`). The publish route builds it in the Worker
 * from the files it was sent, so this writer has to run there: no `node:fs`, no `node:zlib`, only
 * `CompressionStream`, which Workers and Node both have.
 *
 * THE SAME FILES ALWAYS MAKE THE SAME BYTES: paths sorted, mode 0644, owner 0, time 0. The engine
 * hashes what it extracts, not the archive, so this is for the stored copy: one config, one blob.
 *
 * `filesVersion` names a set of files the way `versionKey` names a compile: `sha256-<hex>` of the
 * canonical JSON of the path -> contents map.
 */

import { canonicalJSON, sha256Hex } from "./declaration-version.mjs";

export class ArchiveError extends Error {}

const encoder = new TextEncoder();

/**
 * A path is relative, uses `/`, and never climbs out: the engine extracts with tarfile's "data"
 * filter, which refuses these too, but a refusal here names the file before anything is sent.
 */
export function checkPath(path) {
  if (typeof path !== "string" || path === "") throw new ArchiveError("a config path is empty");
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new ArchiveError(`config path ${JSON.stringify(path)} is not a relative path`);
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new ArchiveError(`config path ${JSON.stringify(path)} has an empty, '.' or '..' part`);
  }
}

/** `sha256-<hex>` of the canonical JSON of `files` — the identity of one set of config files. */
export function filesVersion(files) {
  return "sha256-" + sha256Hex(encoder.encode(canonicalJSON(files)));
}

function writeString(block, offset, length, value) {
  const bytes = encoder.encode(value);
  if (bytes.length > length) throw new ArchiveError(`tar field too long: ${value}`);
  block.set(bytes, offset);
}

function writeOctal(block, offset, length, value) {
  writeString(block, offset, length, value.toString(8).padStart(length - 1, "0"));
}

/** Split a path into ustar's `prefix` (up to 155 bytes) and `name` (up to 100) at a `/`. */
function splitPath(path) {
  if (encoder.encode(path).length <= 100) return { prefix: "", name: path };
  for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (encoder.encode(prefix).length <= 155 && encoder.encode(name).length <= 100) return { prefix, name };
  }
  throw new ArchiveError(`config path ${JSON.stringify(path)} is too long for a tar header`);
}

function header(path, size) {
  const block = new Uint8Array(512);
  const { prefix, name } = splitPath(path);
  writeString(block, 0, 100, name);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, 0);
  block.fill(0x20, 148, 156); // the checksum counts its own field as spaces
  block[156] = 0x30; // "0": a regular file
  writeString(block, 257, 6, "ustar");
  writeString(block, 263, 2, "00");
  writeString(block, 345, 155, prefix);
  let sum = 0;
  for (const byte of block) sum += byte;
  writeString(block, 148, 7, sum.toString(8).padStart(6, "0") + "\0");
  return block;
}

/**
 * @param {Record<string, string>} files path -> contents
 * @returns {Uint8Array} an uncompressed ustar archive
 */
export function tar(files) {
  const parts = [];
  let total = 0;
  for (const path of Object.keys(files).sort()) {
    checkPath(path);
    const body = encoder.encode(files[path]);
    const padded = Math.ceil(body.length / 512) * 512;
    parts.push(header(path, body.length), body, new Uint8Array(padded - body.length));
    total += 512 + padded;
  }
  parts.push(new Uint8Array(1024)); // two zero blocks end the archive
  total += 1024;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
export async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Record<string, string>} files @returns {Promise<Uint8Array>} the engine's `POST /config` body */
export async function archive(files) {
  return gzip(tar(files));
}
