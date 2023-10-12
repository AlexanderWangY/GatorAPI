import * as fs from "fs";

interface Question {
    "ID": number,
    "Text": string
    "Zeros": number,
    "Ones": number,
    "Twos": number,
    "Threes": number,
    "Fours": number,
    "Fives": number,
    "Mean": number,
    "StDev": number
}

interface Evaluation {
    "__type": string,
    "Key2": string,
    "Term": string,
    "TermLit": string,
    "CollegeCode": string,
    "CollegeName": string,
    "DepartmentCode": string | null,
    "DepartmentName": string,
    "Course": string,
    "CourseTitle": string,
    "Section": string,
    "InstructorTitle": null,
    "IsPubliclyAvailable": boolean,
    "Enrolled": number,
    "Responded": number,
    "ResponseRate": number,
    "InstructorName": string,
    "OriginalSource": string | null,
    "Questions": Question[]
}

function getAllEvaluations(): Evaluation[] {
    let allEvals: Evaluation[] = [];

    const evalsDir = "../GatorRater/evals";
    fs.readdir(evalsDir, (err, files) => {
        if (err) {
            console.log(`Unable to read directory: ${err}`);
            return;
        }

        files.forEach((file) => {
            allEvals = [...allEvals, JSON.parse(file)];
        })
    });

    return allEvals;
}
