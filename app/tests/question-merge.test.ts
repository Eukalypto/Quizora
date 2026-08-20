import { describe, expect, test } from "bun:test";
import { buildQuestionId, mergeQuestionBank, parseSubjectIndex } from "../src/lib/quiz/question-merge";

// Compact synthetic index covering the real structural cases:
// - a hierarchy-1 combined Subject (History) spanning two leaf pairs
// - a hierarchy-2 "continent catch-all"-shaped combined Subject (Europe)
//   carrying a real ratio despite not being hierarchy 1 (the bug this
//   rework fixes — detection must be structural, not hierarchy===1)
// - a "group-constant" combined Subject (Sciences 2) whose continuation
//   rows leave Groups blank, needing carry-forward
// - a combined Subject (Entertainment) whose components span two
//   unrelated Groups (Screens, Entertainment) — no constant axis at all
// - two non-combined hierarchy-1 entries (Apple Subject, Bizarre) to
//   verify alphabetical-with-Bizarre-last sorting
const BOM = "﻿";
const SYNTHETIC_INDEX = `${BOM};Subject;Hierarchy;Groups;Subgroups;ID of the Subgroup;Ratio
1;History of Europe;3;Europe;History;001;
2;History of Asia;3;Asia;History;002;
3;History;1;Europe;History;001;6
;;;Asia;History;002;4
4;Europe;2;Europe;History;001;10
5;Physics;2;Sciences;Physics;003;
6;Chemistry;2;Sciences;Chemistry;004;
7;Sciences 2;1;Sciences;Physics;003;5
;;;;Chemistry;004;5
8;Cinema;2;Screens;Cinema;005;
9;Stand-up;3;Entertainment;Stand-up;006;
10;Entertainment;1;Screens;Cinema;005;7
;;;Entertainment;Stand-up;006;3
11;Equations;3;Equations;Equations;007;
12;Bizarre;1;Bizarre;Bizarre;008;
13;Apple Subject;1;Apple;Apple;009;
`;

const MISMATCHED_INDEX = `${BOM};Subject;Hierarchy;Groups;Subgroups;ID of the Subgroup;Ratio
1;History of Europe;3;Europe;History;001;
2;History of Asia;3;Asia;History;002;
3;History;1;Europe;History;001;6
;;;Asia;History;002;3
`;

function q(id: number, group: string, subgroup: string, question = `Q${id}`) {
  return {
    id,
    group,
    subgroup,
    level: 1,
    question,
    answers: ["A", "B", "C", "D"],
    correct: 0,
    media_url: "",
  };
}

const IMAGE_QUESTIONS_EMPTY = "[]";

describe("parseSubjectIndex", () => {
  test("strips a leading BOM and parses the header/data split", () => {
    const parsed = parseSubjectIndex(SYNTHETIC_INDEX);
    expect(parsed.entries.length).toBe(13);
    expect(parsed.entries[0].name).toBe("History of Europe");
  });

  test("builds the Groups/Subgroups -> 3-digit code map from column F", () => {
    const parsed = parseSubjectIndex(SYNTHETIC_INDEX);
    expect(parsed.subjectCodes.get("europe history")).toBe("001");
    expect(parsed.subjectCodes.get("sciences chemistry")).toBe("004");
  });

  test("detects a combined Subject structurally, not by hierarchy === 1 (the continent catch-all case)", () => {
    const parsed = parseSubjectIndex(SYNTHETIC_INDEX);
    const europe = parsed.entries.find((e) => e.name === "Europe")!;
    expect(europe.hierarchy).toBe(2);
    // No ratio-sum mismatch reported for it means it was correctly picked
    // up as combined and validated (a non-combined single component with a
    // ratio would never be sum-checked at all).
    expect(parsed.ratioTotalMismatches.some((m) => m.startsWith("Europe:"))).toBe(false);
  });

  test("carries forward a blank Groups value on continuation rows (group-constant blocks)", () => {
    const parsed = parseSubjectIndex(SYNTHETIC_INDEX);
    const sciences2 = parsed.entries.find((e) => e.name === "Sciences 2")!;
    expect(sciences2.components).toEqual([
      { groups: "Sciences", subgroups: "Physics", subgroupId: "003", ratio: 5 },
      { groups: "Sciences", subgroups: "Chemistry", subgroupId: "004", ratio: 5 },
    ]);
  });

  test("reports a combined Subject whose ratios don't sum to 10", () => {
    const parsed = parseSubjectIndex(MISMATCHED_INDEX);
    expect(parsed.ratioTotalMismatches).toEqual(["History: ratios sum to 9, expected 10"]);
  });
});

describe("buildQuestionId", () => {
  test("matches the brief's worked example: 001 + 01 + 0001 -> 1010001", () => {
    expect(buildQuestionId("001", 1, 1)).toBe(1010001);
  });
});

describe("mergeQuestionBank", () => {
  const files = [
    { name: "Europe History", content: JSON.stringify([q(1, "Europe", "History"), q(2, "Europe", "History")]) },
    { name: "Asia History", content: JSON.stringify([q(1, "Asia", "History")]) },
    { name: "Sciences Physics", content: JSON.stringify([q(1, "Sciences", "Physics")]) },
    { name: "Screens Cinema", content: JSON.stringify([q(1, "Screens", "Cinema")]) },
    { name: "Entertainment Standup", content: JSON.stringify([q(1, "Entertainment", "Stand-up")]) },
    { name: "Mars Colonies", content: JSON.stringify([q(1, "Mars", "Colonies")]) }, // no index row at all
  ];

  test("throws when no index is provided — the index is required, not optional", () => {
    expect(() => mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: null })).toThrow();
  });

  test("assigns composite ids from the file's own subjectCode + file rank + source id", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    const europeQ1 = result.questions.find((qq) => qq.question === "Q1" && qq.subcategories.includes("cat-1"));
    expect(europeQ1?.id).toBe(buildQuestionId("001", 1, 1));
  });

  test("a file with no matching index row is skipped and reported, never throws", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    expect(result.unmatchedFiles.some((f) => f.startsWith("Mars Colonies.json"))).toBe(true);
    expect(result.questions.some((qq) => qq.question === "Q1" && qq.level === 1 && qq.subcategories.length === 0)).toBe(false);
  });

  test("a question tags every index entry it's a component of (leaf + every combined parent)", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    const europeHistoryQ = result.questions.find((qq) => qq.id === buildQuestionId("001", 1, 1))!;
    // Component of: "History of Europe" (cat-1, its own leaf), "History"
    // (cat-3, combined), "Europe" (cat-4, combined catch-all).
    expect(europeHistoryQ.subcategories).toEqual(expect.arrayContaining(["cat-1", "cat-3", "cat-4"]));
  });

  test("a combined Subject spanning unrelated Groups (Entertainment) still tags both member pairs correctly", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    const cinemaQ = result.questions.find((qq) => qq.id === buildQuestionId("005", 1, 1))!;
    const standupQ = result.questions.find((qq) => qq.id === buildQuestionId("006", 1, 1))!;
    expect(cinemaQ.subcategories).toEqual(expect.arrayContaining(["cat-8", "cat-10"]));
    expect(standupQ.subcategories).toEqual(expect.arrayContaining(["cat-9", "cat-10"]));
  });

  test("dual-tags questions belonging to a legacy-named combined Subject, and only those", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    const historyQ = result.questions.find((qq) => qq.id === buildQuestionId("001", 1, 1))!;
    const cinemaQ = result.questions.find((qq) => qq.id === buildQuestionId("005", 1, 1))!;
    expect(historyQ.subcategories).toContain("history"); // "History" is a legacy-named Subject
    expect(cinemaQ.subcategories).not.toContain("screens"); // "Entertainment" isn't legacy-named; "Screen Arts" doesn't exist in this fixture
  });

  test("taxonomy.topLevel stays the fixed legacy list regardless of real content", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    expect(result.taxonomy.topLevel).toContain("history");
    expect(result.taxonomy.topLevel).toContain("sciences-2");
  });

  test("taxonomy.domains lists every combined Subject's cat-tag", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    expect(result.taxonomy.domains).toEqual(expect.arrayContaining(["cat-3", "cat-4", "cat-7", "cat-10"]));
    expect(result.taxonomy.domains).not.toContain("cat-1"); // a leaf, not combined
  });

  test("an index Subject with no matching file is reported and excluded from categories, not an error", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    expect(result.indexOnlySubjects).toContain("Equations");
    expect(result.categories.some((c) => c.label === "Equations")).toBe(false);
  });

  test("sorts categories alphabetically within a tier, with Bizarre pinned last in Domains", () => {
    const result = mergeQuestionBank({ files, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    // Bizarre has no backing file in this fixture, so it won't appear at
    // all — re-run with a Bizarre file present to test the sort itself.
    const withBizarre = mergeQuestionBank({
      files: [...files, { name: "Bizarre Bizarre", content: JSON.stringify([q(1, "Bizarre", "Bizarre")]) }],
      imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY,
      ratioCsv: SYNTHETIC_INDEX,
    });
    const domainLabels = withBizarre.categories.filter((c) => c.kind === "top-level").map((c) => c.label);
    expect(domainLabels).toEqual(["Entertainment", "History", "Sciences 2", "Bizarre"]);
    expect(result).toBeTruthy();
  });

  test("alphabetical file rank when two files share the same Group/Subgroup pair", () => {
    const dup = [
      { name: "B File", content: JSON.stringify([q(1, "Europe", "History")]) },
      { name: "A File", content: JSON.stringify([q(1, "Europe", "History")]) },
    ];
    const result = mergeQuestionBank({ files: dup, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    const aFileQ = result.questions.find((qq) => qq.id === buildQuestionId("001", 1, 1));
    const bFileQ = result.questions.find((qq) => qq.id === buildQuestionId("001", 2, 1));
    expect(aFileQ).toBeTruthy(); // "A File" alphabetically first -> rank 1
    expect(bFileQ).toBeTruthy(); // "B File" -> rank 2
  });

  test("rejects a row whose source id is outside 1-9999", () => {
    const mixedFile = [
      { name: "Europe History", content: JSON.stringify([q(0, "Europe", "History"), q(1, "Europe", "History")]) },
    ];
    const result = mergeQuestionBank({ files: mixedFile, imageQuestionsRaw: IMAGE_QUESTIONS_EMPTY, ratioCsv: SYNTHETIC_INDEX });
    expect(result.failures.some((f) => f.includes("id: must be an integer 1-9999"))).toBe(true);
    expect(result.questions.length).toBe(1);
  });

  test("image-questions supplement gets small negative ids, distinct from real question ids", () => {
    const imageQuestions = JSON.stringify([
      { subcategories: ["history", "europe"], level: 1, question: "Img1", answers: ["A", "B", "C", "D"], correct: 0, media_url: "https://example.com/a.jpg" },
    ]);
    const result = mergeQuestionBank({ files, imageQuestionsRaw: imageQuestions, ratioCsv: SYNTHETIC_INDEX });
    const imgQ = result.questions.find((qq) => qq.question === "Img1")!;
    expect(imgQ.id).toBe(-1);
  });
});
