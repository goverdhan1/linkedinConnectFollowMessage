with open('merged/merged.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()[:20]
    for i, line in enumerate(lines, 1):
        print(f"{i}: {repr(line.strip())}")
