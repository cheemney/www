---
title: "I Want to Build Things, Not Maintain My Distro"
date: 2026-06-15
draft: false
tags: ["linux", "developer-tooling", "engineering"]
description: "At some point I realized I was spending more time maintaining my development environment than actually building software."
---

For years I believed the ideal developer setup was the most customizable one. The perfect window manager, the perfect terminal emulator, the perfect shell prompt, the perfect package manager, the perfect Linux distribution. I spent countless hours tweaking themes, rebuilding configs, rewriting dotfiles, and chasing bleeding-edge tools -- all while convincing myself that every small optimization made me a better engineer.

Sometimes it did. Most of the time, it just made me tired.

At some point I noticed something uncomfortable: I was spending more time maintaining my environment than building software.

Once you start working on real systems -- distributed services, Kubernetes clusters, databases, production infrastructure -- your perspective on tooling shifts pretty fast. You stop caring about infinite customization and start caring about operational stability.

## The hidden cost of "freedom"

One of Linux's biggest selling points is freedom. You can customize nearly everything: the desktop environment, the init system, the package manager, the compositor, even the kernel itself if you want to go that far. Early on, this feels great.

Then one day a system update breaks your graphics stack. A package version changes behavior unexpectedly. Docker stops working after a kernel update. Audio randomly disappears. Your terminal config breaks after a plugin update.

Individually these are small problems. Together they add up to constant cognitive overhead -- and cognitive overhead is expensive. Not because engineers can't solve small problems, but because we have limited attention. Every interruption is attention you're not spending on the thing you actually wanted to build.

## Linux slowly became a hobby

This hit me hardest after spending a few years around backend infrastructure. When your day job involves Go, PostgreSQL, Redis, ScyllaDB, Kubernetes, and distributed systems, you naturally start optimizing for predictability everywhere else. You already solve enough complexity at work. You don't want your operating system competing for the same mental bandwidth.

But a lot of Linux setups encourage exactly this. You end up in a loop: adjusting configs, rebuilding environments, chasing package incompatibilities, debugging display issues, migrating between tools, rewriting your shell setup every few months. Eventually your workstation becomes another production system to maintain -- except nobody's paying you to maintain it.

## Reproducibility matters more than personalization

One thing infrastructure engineering teaches you is that reproducibility scales better than personalization. That's why containers, Infrastructure as Code, and immutable deployments became industry standards. Not because they're exciting, but because they reduce uncertainty.

The same principle applies to dev environments. A boring setup is underrated. A predictable one that behaves the same way tomorrow as it does today is genuinely valuable, even if it doesn't feel that way at setup time.

As engineers, we tend to romanticize complexity because complexity feels powerful. But operational simplicity is usually what survives.

## It's not just Linux

To be fair, no OS is perfect. I've had issues on macOS too -- with package managers, terminal setups, development tooling across the board. What exhausted me wasn't any single failure. It was the frequency.

A small update breaks something. A plugin changes behavior. A dependency becomes incompatible. A package disappears. A workaround becomes outdated. After enough of these cycles, you stop feeling like you're using a tool and start feeling like you're maintaining an ecosystem.

Eventually I started asking a simple question: why am I spending engineering energy here?

## The older I get, the more I like boring technology

There's a well-known idea in engineering: choose boring technology. I think it applies to operating systems too.

These days I care a lot more about stable environments, long-term support, predictable updates, and low maintenance overhead than I do about flexibility for its own sake. This doesn't mean Linux is bad -- it means priorities change. Early in your career, customization feels productive because you're learning. Later, stability becomes productive because you're shipping.

## What I actually want from my OS

I don't want my operating system to be a project anymore. I want my editor to open instantly, my containers to run reliably, and my updates to not randomly break my workflow. I want tooling that stays predictable from one month to the next.

The best development environment is often the one you stop thinking about. Because the goal was never to maintain the workstation. The goal was always to build things.
