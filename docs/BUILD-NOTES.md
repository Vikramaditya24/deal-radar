# Build notes

**How this was built.** I chose the product direction (an acquisition-target tool instead of a generic lead scraper) and used ChatGPT to generate most of the code, working in phases. I ran the code locally, reviewed it, and checked the tests, typecheck and production build.

**Time.** About 3-4 hours of my own hands-on time prompting, running and reviewing. The challenge asked for roughly 5 hours of coding. The scope is larger than a hand-written build of this size, because AI generated most of the code.

**What I verified:** 75 automated tests pass, typecheck and production build succeed, and the app boots from a clean checkout and loads the demo data.

**What I did not verify:** live crawling of real sites at scale, and cross-browser testing.
