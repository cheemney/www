---
title: "I Built Shazam from Scratch to Understand How It Actually Works"
date: 2026-05-25
draft: false
tags: ["go", "dsp", "audio", "signal-processing", "research-project", "audio-fingerprinting"]
categories: ["projects", "deep-dives"]
summary: "How I went from 'Shazam is magic' to building a working audio fingerprinting engine in Go, with a full DSP pipeline, SQLite persistence, and an HTTP API."
---

I've used Shazam for years without really understanding it. Hold up your phone, wait three seconds, done. Every explanation I found online said something like "it uses audio fingerprints" — which is technically true but explains nothing. I wanted to understand the actual mechanism. So I built it.

This is the story of that project: what I learned, what surprised me, what broke, and what the code actually looks like.

---

## What I Thought vs. What's Actually Happening

My initial mental model was something like: Shazam stores compressed audio, and when you query it, it does a fuzzy audio comparison. Wrong on every level.

The real algorithm — published by Avery Wang at Shazam in a 2003 paper called _An Industrial-Strength Audio Search Algorithm_ — is clever in a way I genuinely did not expect. It never compares audio signals directly. It doesn't do any similarity search. It's essentially a hash table lookup with some statistical voting on top.

Here's the core idea in plain language:

A song has certain frequencies that are loud at certain times. If you plot frequency vs. time and mark only the _loudest local peaks_, you get a sparse scatter of dots — maybe 200 dots for 5 seconds of audio, down from millions of raw samples. Wang called this a **constellation map**.

Now pair up nearby dots. For each dot A (the "anchor"), pair it with a few dots that come later (the "targets"). Encode each pair as a hash: `(anchor_frequency, target_frequency, time_gap_between_them)`. Store these hashes indexed by value, with the song ID and the anchor's timestamp attached.

When you want to identify a clip: run the same process on the clip, look up each hash in the database, and see which song accumulates the most hits at the _same time offset_. Genuine matches vote together; accidental collisions scatter.

That's Shazam. It's a voting algorithm over a hash table.

---

## Why Go

I wanted a language where I could implement the FFT myself without it being painful, write the whole thing as a real package structure rather than a single script, and have tests that actually ran fast. Go checked all of those boxes.

The package model also forced good architectural discipline. The DSP layer doesn't know about HTTP. The fingerprinting layer doesn't know about SQLite. Each package has a clean interface and can be tested independently. I didn't plan this up front — it emerged naturally from Go's import system making circular dependencies a compile error.

---

## Building It Step by Step

I built this in five distinct stages over several sessions. Each stage produced working, tested code before I moved on.

### Stage 1: FFT and Spectrogram

The first thing you need is a way to see what frequencies are present in audio at any given moment. That's the Short-Time Fourier Transform: slice the signal into overlapping chunks, apply an FFT to each chunk, and stack the results into a 2D grid (time × frequency).

I implemented the Cooley-Tukey radix-2 FFT from scratch. The algorithm is genuinely elegant once you understand the core insight: a DFT of N points can be split into two DFTs of N/2 points (even-indexed and odd-indexed samples), combined with a set of complex multiplications called "twiddle factors." Keep splitting recursively and you go from O(N²) to O(N log N).

The piece I kept getting wrong early on was windowing. When you slice audio into a frame, you're multiplying it by a rectangular function — which creates sharp edges at the frame boundaries. Those edges introduce fake high-frequency content (spectral leakage) that pollutes the FFT output. The fix is to apply a Hann window before the FFT: a smooth curve that tapers the frame to zero at both ends. Once I added that, my test (a pure 440 Hz sine) produced energy in exactly one bin instead of smearing across dozens.

The smoke test that convinced me the FFT was right:

```go
// Generate 440 Hz sine at 44100 Hz, compute spectrogram,
// find the bin with maximum energy in frame 0.
expectedBin := int(math.Round(440.0 * 4096 / 44100)) // = 41
// → detected bin: 41 (441.43 Hz)  ✓
```

### Stage 2: Peak Picking

With a working spectrogram, the next question is: which of the 2049 frequency bins per frame are actually _interesting_?

The answer is: the ones that are local maxima in both time and frequency simultaneously. A peak at bin `f` in frame `t` must have more energy than all its neighbors in a `±2 frames × ±5 bins` window.

The subtlety is the threshold. If you use a fixed dB cutoff, you get too many peaks on loud recordings and too few on quiet ones. The fix is adaptive: compute the median dB of each frame and require that a peak exceed that by at least 10 dB. This normalizes the threshold to the signal's own noise floor.

The other thing that matters is frequency diversity. Without intervention, peaks cluster in whatever frequency range has the most energy — usually 1–5 kHz for music. A bass guitar note at 100 Hz and a hi-hat at 8 kHz would both be missed. The solution is to divide the spectrum into six logarithmic bands and enforce a quota: at most 5 peaks per band per frame. This mirrors how humans perceive pitch (logarithmically) and ensures fingerprints represent the full sonic character of a song.

One thing I discovered the hard way: the band floor mattered more than I expected. I originally set it at 300 Hz, which cut off the entire G major chord I was using as a test case (196, 247, 294 Hz — all below 300 Hz). Dropped it to 200 Hz and the tests passed. This kind of parameter archaeology is what makes building DSP systems educational in a way that reading about them isn't.

### Stage 3: Hashing and Matching

This is the piece I found most conceptually interesting.

The hash encodes the _relationship_ between two peaks, not the peaks themselves. Three numbers: anchor frequency, target frequency, and the time gap between them. Packed into a 32-bit integer:

```
[31..22] anchor bin   (10 bits)
[21..12] target bin   (10 bits)
[11.. 0] delta time   (12 bits, up to 4095 frames ≈ 190 seconds)
```

No absolute time anywhere in the hash. This is the key design choice that makes matching work on clips from anywhere in a song. The same musical phrase produces the same hash whether it occurs at second 10 or second 60.

When you query with a clip, you generate the same hashes and look them up. Each lookup returns a list of `(song_id, reference_time_offset)` pairs. For each hit, compute `alignment = reference_offset − query_offset`. If the clip genuinely came from song S at position P, then every hit produces `alignment ≈ P`. Everything else is noise scattered across random alignment values.

I wrote a test to verify alignment recovery — take a reference recording, extract a sub-clip starting at frame 20, re-index it to start at frame 0, match it, and check that the recovered alignment is approximately 20. The first time I wrote this test using a pure 440 Hz sine, it failed unpredictably. That's because a pure sine produces identical hashes on every frame — all alignments get the same number of votes and the winner is random. I had to switch to a chord (multiple frequencies) to generate hash diversity. This was a good lesson about the difference between a _working_ algorithm and a _testable_ algorithm.

### Stage 4: WAV I/O and SQLite

After getting the fingerprinting math right, I needed real persistence. Two pieces:

**WAV reader**: The RIFF/WAV format is a chunked container. You scan forward through chunks looking for `fmt` (format descriptor) and `data` (raw samples). Unknown chunks (`LIST`, `INFO`, `smpl`, etc.) get skipped. The reader handles 8, 16, and 32-bit PCM and downmixes stereo to mono.

One refactor I had to make: the original WAV writer wrote to `*os.File`. When I built the HTTP layer, I needed to encode WAV into a `bytes.Buffer` for test requests. I split it into `EncodeWAV(io.Writer)` plus a `WriteWAV(path)` wrapper. Obvious in hindsight, but a good example of how interface requirements propagate.

**SQLite**: The schema is simple — a `songs` table and a `fingerprints` table. The critical detail is the index:

```sql
CREATE INDEX idx_fp_hash ON fingerprints(hash);
```

Without this, every `Lookup()` call is a full table scan. With it, it's a B-tree seek: O(log N + K) where K is the number of matches. For a library of any real size, this is the difference between a usable system and an unusable one.

I also found a subtle uint32/int64 boundary issue: SQLite's INTEGER type is signed 64-bit. A hash of `0xFFFFFFFF = 4294967295` stored as int32 wraps to -1. I wrote a specific test for this case after discovering it could silently corrupt lookups.

### Stage 5: HTTP API

The HTTP layer was intentionally the last thing I built. By that point, all the hard work was done and the API was just a shell.

The key architectural decision was `pipeline.go` — a struct that owns all the DSP configuration and exposes two methods: `Index(io.Reader, name, store)` and `Query(io.Reader, store)`. HTTP handlers know nothing about `dsp.SpectrogramConfig` or `fingerprint.HasherConfig`. They call the pipeline and get a typed result back. This makes the handlers trivially thin and independently testable.

The middleware chain follows the standard Go pattern:

```
requestID → logger → recovery → maxBodySize → handler
```

Recovery middleware catches panics (one bad request shouldn't crash the server). The logger captures status code via a `ResponseWriter` wrapper that intercepts `WriteHeader`. The request ID is a monotonically incrementing counter stamped on every response header.

Graceful shutdown is handled by passing a `context.Context` to `server.Serve()`. When the context is cancelled (from `signal.NotifyContext` in `main`), the server calls `http.Server.Shutdown()` with a 10-second drain window. Clean exit, no dropped requests.

---

## What I Learned

**DSP is full of parameter archaeology.** The 300 Hz band floor, the 10 dB threshold, the 5-targets-per-anchor limit — none of these are derivable from first principles. They're empirically tuned numbers from people who ran experiments. Building the system myself meant I had to confront each one directly rather than just accepting it.

**The constellation map is the real innovation.** The FFT is standard signal processing. Hashing frequency pairs is a fairly obvious extension once you have peaks. What makes Shazam work is the insight that you can throw away 99.9% of the spectrogram and still have enough information to identify a song, because the structure you care about (dominant frequency relationships) is robust to the noise you're worried about (recording quality, background noise, EQ).

**Pure functions are essential for DSP testing.** Because each stage of the pipeline is a pure function (same input → same output, no side effects), I could test each one in isolation with synthetic signals I fully controlled. The tests for the matching stage use a real DSP pipeline on synthetic WAV data — not mocks — because the thing I actually needed to test was whether the math produced the right answer end-to-end.

**Go interfaces made the store swap-in trivial.** The `Store` interface was defined once. `MemoryStore` and `SQLiteStore` both implement it. All fingerprint and matching code never knew the difference. When I added SQLite in Stage 4, zero fingerprinting code changed.

**Build incrementally, test at each step.** I did not write the full system and then debug it. Each stage was tested in isolation before the next began. This sounds obvious but is surprisingly easy to skip when you're excited to see the end result.

---

## The Numbers

For a synthetic 3-song library:

- Indexing a 7-second WAV: **~65ms**
- Querying a 3-second clip: **~32ms**
- Hashes per 7-second song: **~1000**
- Database size for 3 songs: **~24 KB**
- Test count: **87 tests, all passing**

---

## What I'd Do Differently

**Add resampling from day one.** The engine assumes 44100 Hz input. Real audio comes in at 8 kHz (phone voice), 48 kHz (video), 22050 Hz (older recordings). A `Resample(pcm, targetRate int) PCM` function is a straightforward linear interpolation but I kept deferring it.

**Use a uint64 hash instead of uint32.** Thirty-two bits gives 4 billion possible hash values. For a small library this is fine, but at scale hash collisions between songs add noise to the voting step. Sixty-four bits would make collisions negligible.

**Test with real audio earlier.** Every test in this project uses synthetic WAV data (sine waves and chords). Real music has transients, reverb, harmonic distortion, and all sorts of other structure that I'm confident the algorithm handles — but I haven't actually verified it.

---

## Resources

- **Wang, Avery (2003). "An Industrial-Strength Audio Search Algorithm."** The original Shazam paper. Freely available online. Reading this first was useful context but the math was clearer after I'd already implemented something.

- **The Scientist and Engineer's Guide to DSP by Steven Smith.** Free online. The chapters on the DFT and FFT are exceptionally clear. This is where I went when the butterfly diagram stopped making sense.

- **"How does Shazam work?" — Coding Explained (YouTube).** The best non-paper explanation I found. Covers the constellation map concept with actual diagrams.

---

## The Code

The full source is at [github.com/cheemney/audiofp](https://github.com/cheemney/audiofp).

If you're curious about how Shazam works and want something you can actually run, modify, and break — this might be useful.
