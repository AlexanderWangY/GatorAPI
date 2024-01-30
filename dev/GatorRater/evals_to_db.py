import json
import glob

if __name__ == '__main__':
    # if your computer has enough ram for this that is great
    # evaluations = []
    # for filename in glob.iglob("./dev/GatorRater/evals/evaluations_*.json"):
    #     with open(filename, "r") as infile:
    #         evaluations += json.load(infile)
    
    # with open("./dev/GatorRater/evals/evaluations.json", "w") as outfile:
    #     json.dump(evaluations, outfile)
        
    # I had to do it in chunks
    with open("./evaluations.json", "w") as outfile:
        outfile.write('[')
        first = True
        for filename in glob.iglob("./evals/evaluations_*.json"):
            with open(filename, "r") as infile:
                body = infile.read().replace(' ', '').replace('\n', '').replace('\t', '')
                if not first:
                    outfile.write(',')
                else:
                    first = False
                outfile.write(body.strip('[]'))
        outfile.write(']')