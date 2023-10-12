import * as fs from "fs";
import { exit } from "process";

let comboInd: number = 0;
function nextCombo(): string | null {
  const chars = "abcdefghijklmnopqrstuvwxyz,- ";
  if (comboInd < chars.length * chars.length)
    return `${chars[Math.floor(comboInd / chars.length)]}${
      chars[comboInd++ % chars.length]
    }`;
  return null;
}

function getCombos(): string[] {
  let combos: string[] = [];
  let charCombo: string | null;
  while ((charCombo = nextCombo()) !== null) {
    combos.push(charCombo);
  }
  return combos;
}

interface Instructor {
  Name: String; // "Johnson,Sally E"
  Key: number; // -1926156022
  Term5: string; // "20118"
  TermName: string; // "Fall 2011"
  TermFull: string; // "20118 <em>Fall 2011</em>"
}

interface Question {
  ID: number;
  Text: string;
  Zeros: number;
  Twos: number;
  Threes: Number;
  Fours: Number;
  Fives: Number;
  Mean: Number;
  StDev: Number;
}

interface Evaluation {
  __type: string; // "Web.Evaluations.PublicResults.Evaluation"
  Key2: string; // "20181_1510547920_4576"
  Term: string; // "20181"
  TermLit: string; // "2018 Spring"
  CollegeCode: string; // "LS"
  CollegeName: string; // "Liberal Arts and Sciences"
  DepartmentCode: string | null; // null
  DepartmentName: string; // "Mathematics"
  Course: string; // "MAC2313"
  CourseTitle: string; // "Analyt Geom \u0026 Calc 3"
  Section: string; // "4576"
  InstructorTitle: string | null; // null
  IsPubliclyAvailable: boolean; // false
  Enrolled: number; // 30
  Responded: number; // 24
  ResponseRate: number; // 80
  InstructorName: string; // "Huang,Shu Jen"
  OriginalSource: string | null; // null
  Questions: Question[];
}

async function fetchInstructors(): Promise<Instructor[]> {
  const combos = getCombos();

  let fetches = await Promise.all(
    combos.map((query) =>
      fetch(
        `https://evaluations.ufl.edu/results/default.aspx/GetInstructorsByName?query=${query}`,
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      ).then((r) => r.json())
    )
  );

  return fetches.flatMap((instructors) => instructors?.d?.aaData ?? []); // Ignore 500s from invalid query strings
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let FAILURES: string[] = [];
const retryFetch = async (
  url: string,
  fetchOptions = {},
  retries = 3
): Promise<Response | null> => {
  const response = await fetch(url, { ...fetchOptions });

  // check the response status code
  if (response.status !== 200) {
    console.warn(`*Retrying [${retries} Retries Remaining]* ${url}`);
    // wait
    await delay(10_000);
    // retry the request
    if (retries == 0) {
      FAILURES.push(url);
      return null;
    }
    return await retryFetch(url, fetchOptions, retries - 1);
  }

  // return the response
  return response;
};

async function fetchEvaluation(evalId: string): Promise<Evaluation> {
  return await retryFetch(
    `https://evaluations.ufl.edu/results/Instructor.aspx/GetEvaluation?e=${evalId}`,
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    }
  )
    .then((r) => {
      if (r == null)
        // Failed after retries
        return null;
      if (!r.ok) {
        console.error(`Failed to fetch evaluation with ID "${evalId}"`);
        exit();
      }
      return r.json();
    })
    .then((o) => o?.d);
}

async function fetchEvaluations(
  instructors: Instructor[]
): Promise<Evaluation[]> {
  let allEvals: Evaluation[] = [];

  let completedIds: number[] = JSON.parse(
    fs.readFileSync("completed_instructors.json").toString()
  );
  console.log(`${completedIds.length} completed instructors.`);
  console.log();

  // Get unique instuctors (by Key)
  const uniqueInstructors: Instructor[] = [];
  for (const inst of instructors)
    if (!uniqueInstructors.some((x) => x.Key == inst.Key))
      uniqueInstructors.push(inst);
  console.log(
    `Fetching evaluations for ${uniqueInstructors.length} unique instructors of ${instructors.length} instructors.`
  );
  console.log();

  // Write unique instructors (for cross-system analysis)
  console.log("Writing unique instructor names...");
  fs.writeFileSync(
    "unique_instructor_names.txt",
    uniqueInstructors.map((inst) => inst.Name).join("\n")
  );
  console.log("Written.");
  console.log();

  let toAddIDs: number[] = [];
  for (const [i, inst] of uniqueInstructors.entries()) {
    if (completedIds.indexOf(inst.Key) != -1) {
      console.log(
        `Already fetched all evaluations for "${inst.Name}", ${inst.Key}.\n`
      );
      continue;
    }

    console.log(`Fetching evaluation IDs for "${inst.Name}"...`);
    let evaluationIds = await retryFetch(
      `https://evaluations.ufl.edu/results/instructor.aspx?ik=${inst.Key}`
    )
      .then((r) => r!.text())
      .then((t) => {
        console.log("Matching...");
        const count = [...t.matchAll(/x-data-evalid/g)].length - 1; // Discount use in JS
        const found = [...t.matchAll(/x-data-evalid="[A-Z0-9_-]*"/gm)].map(
          (m) => m[0]
        );

        if (found.length != count) {
          console.error(
            `REGEX match generated less IDs than there really are (found ${found.length} of ${count})`
          );
          FAILURES.push(JSON.stringify(inst));
          FAILURES.push(t);
          // exit();
        }
        return found.map((match) => match.slice('x-data-evalid="'.length, -1));
      });
    console.log(`All ${evaluationIds.length} IDs found.`);

    console.log(`Fetching ${evaluationIds.length} evaluations...`);
    let evals: Evaluation[] = [];
    const FETCH_SIZE = 20;
    while (evaluationIds.length > 0) {
      console.log(`\t${evals.length}/${evaluationIds.length}`);
      evals.push(
        ...(await Promise.all(
          evaluationIds
            .slice(0, FETCH_SIZE)
            .map((evalId) => fetchEvaluation(evalId))
        ))
      );
      evaluationIds = evaluationIds.slice(FETCH_SIZE);
    }
    if (evals.some((x) => x == null || x == undefined)) {
      console.error("Failed to fetch an evaluation.");
      // exit();
    }
    console.log("Fetched evaluations for instructor.");
    allEvals.push(...evals);
    toAddIDs.push(inst.Key);

    console.log(
      `\n[${i + 1} of ${
        uniqueInstructors.length
      } Instructors Complete] Running total is at ${
        allEvals.length
      } evaluations with ${FAILURES.length} failures.\n`
    );

    // Check if save if needed
    const BATCH_SIZE = 200;
    if (allEvals.length > BATCH_SIZE) {
      const numEvalsSaved = allEvals.length;
      const numCompletedAlready = completedIds.length;
      const numFailures = FAILURES.length;

      // Write batch of evaluations
      fs.writeFileSync(
        `evals/evaluations_${numCompletedAlready}.json`,
        JSON.stringify(allEvals)
      );
      allEvals = [];

      // Write failures for batch (if any)
      if (FAILURES.length > 0) {
        fs.writeFileSync(
          `fails/failures_${numCompletedAlready}.json`,
          JSON.stringify(FAILURES)
        );
        FAILURES = [];
      }

      // Write completed IDs
      completedIds = [...completedIds, ...toAddIDs];
      toAddIDs = [];
      fs.writeFileSync(
        `completed_instructors.json`,
        JSON.stringify(completedIds)
      );
      console.log(
        `*** Saved ${numEvalsSaved} evaluations and ${numFailures} failures [${numCompletedAlready}]. ***\n`
      );
    }
  }

  return allEvals;
}

const INSTRUCTORS_JSON = "instructors.json";
const EVALUATIONS_JSON = "evaluations.json";
async function main() {
  // Instructors
  let instructors: Instructor[];
  if (!fs.existsSync(INSTRUCTORS_JSON)) {
    console.log("No instructors saved, fetching instructors...");
    instructors = await fetchInstructors();
    console.log(`Fetched ${instructors.length} instructors.`);

    fs.writeFileSync(INSTRUCTORS_JSON, JSON.stringify(instructors));
    console.log(`Instructors written to "${INSTRUCTORS_JSON}".`);
  } else {
    console.log("Reading in instructors...");
    instructors = JSON.parse(fs.readFileSync(INSTRUCTORS_JSON).toString());
    console.log(`Read ${instructors.length} instructors.`);
  }
  console.log();

  // Evaluations
  console.log("Fetching all evaluations for all instructors...");
  const evaluations = await fetchEvaluations(instructors);
  console.log(`Fetched ${evaluations.length} evaluations.`);

  fs.writeFileSync(EVALUATIONS_JSON, JSON.stringify(evaluations));
  console.log(`Evaluations written to "${EVALUATIONS_JSON}".`);
  console.log();

  console.log("All done!");
}

main();
