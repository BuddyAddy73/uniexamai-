"""
merge_pyqs.py — Run this ONCE locally from your project root folder.

Usage:
  python merge_pyqs.py

What it does:
  Takes the new PYQ data (pyq_sem1_rgpv.json) and merges it into your
  existing knowledge_base.json — then saves an updated version back.
  Safe to run multiple times — it checks for duplicates before adding.
"""

import json
import os

KB_PATH = "data/processed/knowledge_base.json"
PYQ_PATH = "pyq_sem1_rgpv.json"

def main():
    if not os.path.exists(KB_PATH):
        print(f"ERROR: Could not find {KB_PATH}")
        print("Make sure you're running this from your project root folder.")
        return

    if not os.path.exists(PYQ_PATH):
        print(f"ERROR: Could not find {PYQ_PATH}")
        print("Place pyq_sem1_rgpv.json in the same folder as this script.")
        return

    with open(KB_PATH, encoding='utf-8') as f:
        kb = json.load(f)

    with open(PYQ_PATH, encoding='utf-8') as f:
        pyqs = json.load(f)

    existing_count = kb['metadata']['total_documents']
    print(f"Current knowledge base: {existing_count} documents")

    # Build a set of existing doc identifiers to avoid duplicates
    existing_ids = set()
    for doc in kb['documents']:
        if doc.get('doc_type') == 'pyq':
            existing_ids.add(f"{doc.get('subject_code')}|{doc.get('exam_date')}")

    next_id = existing_count + 1
    added = 0

    for pyq in pyqs:
        uid = f"{pyq['subject_code']}|{pyq['exam_date']}"
        if uid in existing_ids:
            print(f"  Skipping duplicate: {uid}")
            continue

        doc = {
            "id": next_id,
            "university": "RGPV",
            "branch": "COMMON",
            "semester": "1",
            "subject": pyq['subject_name'],
            "subject_code": pyq['subject_code'],
            "doc_type": "pyq",
            "exam_date": pyq['exam_date'],
            "filename": f"PYQ_{pyq['subject_code']}_{pyq['exam_date'].replace(' ','_')}.ocr",
            "word_count": pyq['word_count'],
            "content": pyq['raw_text']
        }
        kb['documents'].append(doc)
        existing_ids.add(uid)
        next_id += 1
        added += 1
        print(f"  ✅ Added: {pyq['subject_code']} — {pyq['subject_name']} ({pyq['exam_date']})")

    kb['metadata']['total_documents'] = next_id - 1
    kb['metadata']['has_pyqs'] = True

    with open(KB_PATH, 'w', encoding='utf-8') as f:
        json.dump(kb, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Done. Added {added} PYQ documents.")
    print(f"   Knowledge base: {existing_count} → {kb['metadata']['total_documents']} documents")
    print(f"\nNext step: commit and push the updated knowledge_base.json")
    print(f"  git add data/processed/knowledge_base.json")
    print(f"  git commit -m 'Add RGPV Sem 1 PYQs — Physics, Maths, Computer Engineering'")
    print(f"  git push")

if __name__ == "__main__":
    main()
