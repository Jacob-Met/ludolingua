# LUDOLINGUA first-episode contribution

Private authored English/Spanish ordering-and-acrostic fixture for task
`ludolingua-first-episode-receiver-bd63af23`. Original product ownership remains
with `hamon-a19-20261027`; this isolated contribution does not replace the original
source tree. It is not the complete product, model integration, or a native human
playtest. Semantic changes are explicit in each episode's provenance.

Requires Node.js 22 or newer; packaging requires Python 3.9 or newer. No application
dependencies, installation, credentials, or network services are required.

```sh
cd episode-kit
node cli.mjs list
node cli.mjs check en-original
node cli.mjs check es-literal
node cli.mjs export es-adapted /tmp/adapted.json
node cli.mjs receive /tmp/adapted.json
node cli.mjs check /tmp/adapted.json
node serve.mjs
```

Open `http://127.0.0.1:4173` (or the local URL printed by the server). Keep the
server running while using the receiver; do not open the HTML as a `file:` URL.
The loopback HTTP origin supports the browser Web Crypto digest operation.
The author view supports editing and
rechecking; player mode separates solving from deliberate answer reveal.
`check` exits 0 for mechanical success, 2 for valid negative cases, and 1 for
invalid input. `receive` exits 0 when content and recomputed analysis agree,
including a faithfully exported negative case. Inspect `mechanicalSuccess` and
`outcome`; integrity success alone is not puzzle success. Export refuses to
overwrite an existing output file.

Extraction takes the first Unicode code point of each trimmed NFC label and
uppercases it without locale-specific conversion. Accents remain significant.
Uppercase expansion can produce multiple code points (for example ß becomes SS).
Answers use trim, NFC, then uppercase. Ordering solutions are counted independently
of the expected answer. Mechanical checks do not establish language quality,
cultural suitability, equivalent difficulty, or an actual model contribution.

Export hashes the entire episode, including attribution and extra JSON fields,
using SHA256 over recursively key-sorted canonical JSON. Import verifies schema,
episode validity, current digest, engine version, recomputed analysis and fixed
evidence limits. The reader never inherits a supplied pass claim. This is content
integrity, not a cryptographic signature or independent provenance attestation.
Edit the episode and export again to create a current result.

Maintainer verification and deterministic packaging:

```sh
node --test tests/*.test.mjs
python3 scripts/package.py --output ../ludolingua-episode-kit.zip
```

The archive contains source, fixtures, tests, startup instructions and a generated
`MANIFEST.json` with every included source file's byte length and SHA256. Archive
entries use fixed timestamps, ordering and permissions with no compression. Its
SHA256 is written to a separate `.sha256` file, never into its own manifest.
Output must be outside the source directory and must not already exist. Missing
output parent directories are created. Both archive and sidecar paths must be new.
Keep receipts, screenshots, downloaded episodes, credentials and other private
working material outside `episode-kit`: the builder includes all non-hidden
source-tree files except dependency/cache directories, and is not a secret scanner.
The browser receiver currently limits imported JSON to 20,000,000 bytes.
Compare
the sidecar hash after download and verify manifest entries after extraction.
Native execution and consumer receiving must be recorded separately; these
instructions are not a claim that checks have run.
