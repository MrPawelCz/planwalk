# Security

planwalk runs entirely in your browser or in local Node scripts and stores nothing. The viewer makes no network requests of its own; the one exception is the optional `?plan=<url>` parameter, which downloads a plan from the address you give it with a plain GET request (your plan data is never sent). The command line tools talk to nothing outside your machine: `tools/capture.mjs` drives a local Chrome over a loopback socket and `tools/serve.mjs` listens on 127.0.0.1 only. The viewer loads plan JSON as data (no `eval`), and the validator never executes plan content.

Found a problem (for example a plan that makes the viewer run script, or a path issue in a tool)? Please open a private security advisory on GitHub for this repository instead of a public issue, or write to pawel.czerwinski@gmail.com.
