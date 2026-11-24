"""Export reviewed audit draft JSON from stdin; never overwrite existing workpapers."""
import io
import json
import sys
from pathlib import Path


def main():
    from docx import Document

    result = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    if result.get("feature") != "investigation-drafting" or result.get("status") != "draft-for-human-review":
        raise ValueError("investigation draft result required")
    document = Document()
    for line in result["markdown"].splitlines():
        if line.startswith("# "):
            document.add_heading(line[2:], 0)
        elif line.startswith("## "):
            document.add_heading(line[3:], 1)
        else:
            document.add_paragraph(line)
    content = io.BytesIO()
    document.save(content)
    target = Path(sys.argv[1])
    if target.suffix.lower() != ".docx":
        raise ValueError("output must be .docx")
    with target.open("xb") as output:
        output.write(content.getvalue())


if __name__ == "__main__":
    main()
