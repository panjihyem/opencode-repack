import assert from "node:assert/strict"
import { needsIngest } from "./knowledge"

// F-07: manifest hash harus mencegah ingest ulang file yang disentuh tanpa perubahan.
const prior = { size: 12, mtime: 1000, hash: "a".repeat(64) }

assert.equal(needsIngest(undefined, 12, 1000, "a".repeat(64)).ingest, true, "file baru harus di-ingest")
assert.equal(needsIngest(undefined, 12, 1000, "a".repeat(64)).reason, "new")

assert.equal(needsIngest(prior, 12, 1000, "a".repeat(64)).ingest, false, "tidak berubah harus dilewati")
assert.equal(needsIngest(prior, 12, 1000, "a".repeat(64)).reason, "unchanged")

const touched = needsIngest(prior, 12, 2000, "a".repeat(64))
assert.equal(touched.ingest, false, "mtime berubah tanpa perubahan isi harus dilewati")
assert.equal(touched.reason, "same-content")

assert.equal(needsIngest(prior, 12, 2000, "b".repeat(64)).ingest, true, "isi berubah harus di-ingest")
assert.equal(needsIngest(prior, 12, 2000, "b".repeat(64)).reason, "changed")

const legacy = { size: 12, mtime: 1000 }
assert.equal(needsIngest(legacy, 12, 1000, "a".repeat(64)).ingest, true, "manifest lama tanpa hash harus re-ingest sekali")
assert.equal(needsIngest(legacy, 12, 1000, undefined).ingest, true, "hash tak terbaca tanpa hash lama harus re-ingest")
assert.equal(needsIngest(prior, 12, 2000, undefined).ingest, true, "hash tak terbaca dengan mtime berubah harus re-ingest")

console.log("manifest hash F-07: PASS")
