# Third-party benchmark adaptations

Four task families contain small JavaScript adaptations of programs and test
ideas from [QuixBugs](https://github.com/jkoppel/QuixBugs), pinned at commit
`4257f44b0ff1181dedaedee6a447e133219fcebf`. Exact upstream paths and SHA-256
digests are recorded in `templates.v1.json`.

QuixBugs is distributed under the MIT License:

Copyright (c) 2017-2019 James Koppel

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The adaptations preserve the upstream defects but translate them to the local
Node.js fixture format. Local seeded public tests, hidden tests, isolation
checks, and treatment-neutral runner contracts are original to this project.
