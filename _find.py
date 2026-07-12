import sys
fn = sys.argv[1]
terms = sys.argv[2:]
for i, l in enumerate(open(fn, encoding='utf-8')):
    if any(t in l for t in terms):
        print(i + 1, l.rstrip())
