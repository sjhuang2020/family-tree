# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chinese family tree (黄氏家谱 - Huang Family Genealogy) web application that visualizes family relationships and calculates Chinese kinship terms between family members.

**Language:** All UI text, comments, and data are in Chinese (Simplified).

## Running the Application

This is a pure client-side application with no build process:

```bash
# Option 1: Open directly in browser
open index.html

# Option 2: Use a local server (recommended for development)
python3 -m http.server 8000
# Then navigate to http://localhost:8000
```

No dependencies to install - D3.js v7 is loaded from CDN.

## Data Structure

`family.json` contains hierarchical family data with this schema:

```json
{
  "id": "unique-id",
  "name": "姓名",
  "gender": "男" | "女",
  "birthOrder": 1,  // Birth order among siblings
  "parentId": "parent-id" | "",  // Empty string for root ancestor
  "relation": "长子",  // Birth position label (长子, 次女, etc.)
  "generation": 1,  // Generation number (1 = root)
  "spouse": {
    "id": "spouse-id",
    "name": "配偶姓名",
    "gender": "女",
    "relation": "长子配偶"
  },
  "children": [...]  // Array of child objects with same schema
}
```

When editing family data:
- `parentId` must match an existing member's `id`
- `generation` is calculated as parent's generation + 1
- `birthOrder` determines sibling ordering and affects relationship calculations
- Root ancestor has `parentId: ""` and `generation: 1`

## Architecture

### Relationship Calculation Algorithm

The core feature is calculating Chinese kinship terms (称谓) between any two family members. The algorithm logic is **duplicated** in both `index.html` and `person.html` (lines 236-414 in both files).

**Key functions:**
- `extractAllMembers()` - Flattens tree into array for graph traversal
- `findAncestors()` - Finds all ancestors of a member
- `findCommonAncestor()` - Finds lowest common ancestor between two members
- `autoJudgeRelation()` - Main logic that determines the Chinese kinship term

**Algorithm approach:**
1. Calculate generation difference between two members
2. Check if they are direct relatives (parent-child line)
3. For same generation: check siblings, then cousins (堂哥/堂弟)
4. For different generations: use generation gap to determine uncle/nephew terms
5. Birth order determines 哥/弟 or 姐/妹 distinctions

### File Responsibilities

- **index.html**: Home page with D3.js tree visualization, collapsible nodes, relationship calculator widget
- **person.html**: Detail page for individual members, shows immediate family, auto-calculates relationships to core members
- **family.json**: Single source of truth for all family data

### Shared Code Pattern

Both HTML files contain identical utility functions (lines 236-414). When modifying relationship logic, **you must update both files**. Consider extracting to a shared `utils.js` file if making substantial changes.

## Common Modifications

**Adding a family member:**
1. Edit `family.json`
2. Add object to appropriate `children` array
3. Set correct `parentId`, `generation`, and `birthOrder`
4. Include `spouse` object if applicable

**Modifying relationship logic:**
1. Update `autoJudgeRelation()` in **both** `index.html` and `person.html`
2. Test with various generation gaps and birth orders
3. Chinese kinship terms reference: 父母 (parents), 兄弟姐妹 (siblings), 伯叔姑 (paternal uncles/aunts), 堂兄弟 (cousins), 侄子/侄女 (nephews/nieces)

**Styling:**
Both pages use Wikipedia-inspired design with inline CSS. Colors and layout mimic Chinese Wikipedia (zh.wikipedia.org) with:
- #f8f9fa backgrounds
- #0645ad for links
- #a2a9b1 for borders
