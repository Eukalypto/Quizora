import { parseLandingContent } from "@higgsfield/app-landing";

export const landingContent = parseLandingContent({
  hero: {
    eyebrow: "Daily trivia, your way",
    title: "Quiz yourself, your streak, your rules",
    description:
      "Play a daily challenge, a weekly showdown, or free play any topic you want — history, geography, traditions, sciences, music, and more, tagged so you can mix and match.",
    primaryCta: { label: "Open app", href: "/app" },
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
  },
  preview: {
    kind: "route",
    title: "Interactive app preview",
    src: "/app?preview=1",
    openHref: "/app",
    openLabel: "Open full app",
  },
  steps: {
    title: "Play in 3 easy steps",
    description: "Pick a mode, answer against the clock, and watch your streak grow.",
    items: [
      {
        title: "Pick a category",
        description: "Browse tag-based categories — pure topics, regional combos, or specific eras.",
        preview: {
          kind: "instruction",
          icon: "layers",
          title: "Choose your topic",
          description: "History, Geography of Asia, 17th Century, and more",
        },
      },
      {
        title: "Answer against the clock",
        description: "Daily, weekly, or free play — every question is timed and scored.",
        preview: {
          kind: "action",
          label: "Play now",
        },
      },
      {
        title: "Track your streak",
        description: "See your score, XP, and any badges you just unlocked.",
        preview: {
          kind: "result",
          media: { kind: "image", src: "/assets/landing/quiz-result.svg", alt: "Quiz result screen showing a 9 out of 10 score" },
        },
      },
    ],
  },
  features: {
    title: "Built for daily trivia habits",
    description: "Solo challenges to keep your streak alive, and live play for game night.",
    items: [
      {
        icon: "layers",
        title: "Tag-based categories",
        description: "Every category is generated from the question bank's tags — topics, regions, and eras.",
      },
      {
        icon: "sliders",
        title: "Daily, weekly, free play",
        description: "A quick daily challenge, a shared weekly showdown, or unlimited free play by difficulty.",
      },
      {
        icon: "check",
        title: "Streaks, XP, and badges",
        description: "Build a streak, level up, and unlock badges as you play.",
      },
    ],
  },
  showcase: {
    title: "See Quizora in action",
    description: "From solo streaks to same-room live play.",
    items: [
      {
        label: "Categories",
        media: { kind: "image", src: "/assets/landing/landing-categories.svg", alt: "Category chips for History, Geography of Asia, Science, and more" },
      },
      {
        label: "Streaks & badges",
        media: { kind: "image", src: "/assets/landing/landing-streak.svg", alt: "A 7-day streak flame with unlocked badges" },
      },
      {
        label: "Live play",
        media: { kind: "image", src: "/assets/landing/landing-liveplay.svg", alt: "Live play podium ranking three teams" },
      },
    ],
  },
  finalCta: {
    title: "Ready to start your streak?",
    description: "Open Quizora and play today's challenge.",
    action: { label: "Open app", href: "/app" },
  },
});
